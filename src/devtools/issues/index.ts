/**
 * Issue Creation Service
 *
 * Service for creating GitHub issues from conversation context.
 */

import type {
  GitHubIssue,
  IssueFromConversation,
  ConversationMessage,
  ExtractedIssueContext,
  CodeReference,
  IssueCreateRequest,
  IssueCreateResult,
  CreatedIssueQueryOptions,
} from '../types.js';
import type { IssueConfig, GitHubConfig } from '../config.js';
import type { CreatedIssueStore } from '../stores/issue-store.js';
import { GitHubProvider, createGitHubProvider } from '../providers/github.js';

// =============================================================================
// Types
// =============================================================================

export interface IssueCreationServiceConfig extends IssueConfig {
  github: GitHubConfig;
}

// =============================================================================
// Issue Creation Service
// =============================================================================

/**
 * Service for creating GitHub issues
 */
export class IssueCreationService {
  private readonly store: CreatedIssueStore;
  private readonly github: GitHubProvider;
  private readonly config: IssueCreationServiceConfig;
  private initialized = false;

  constructor(store: CreatedIssueStore, config: IssueCreationServiceConfig) {
    this.store = store;
    this.config = config;
    this.github = createGitHubProvider(config.github);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.initialize();
    await this.github.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Create an issue
   */
  async createIssue(request: IssueCreateRequest): Promise<IssueCreateResult> {
    this.ensureInitialized();

    let body = request.body ?? '';
    let extractedContext: ExtractedIssueContext | undefined;

    // Extract context from conversation if requested
    if (request.extractFromConversation && request.conversationId) {
      // In a real implementation, this would fetch conversation from storage
      // For now, we assume body contains the relevant context
    }

    // Apply template if configured
    body = this.formatIssueBody(body, extractedContext);

    // Merge default labels
    const labels = [...(this.config.defaultLabels ?? []), ...(request.labels ?? [])];
    const assignees = [...(this.config.defaultAssignees ?? []), ...(request.assignees ?? [])];

    // Create issue on GitHub
    const result = await this.github.createIssue(request.owner, request.repository, {
      title: request.title,
      body,
      labels: [...new Set(labels)], // Deduplicate
      assignees: [...new Set(assignees)],
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.error ?? 'Failed to create issue',
      };
    }

    // Store issue record
    const issue = await this.store.create({
      number: result.data.number,
      repository: request.repository,
      owner: request.owner,
      title: request.title,
      body,
      labels,
      assignees,
      url: result.data.url,
      createdAt: Date.now(),
    });

    return {
      success: true,
      issue,
      message: 'Issue created successfully',
      url: result.data.url,
    };
  }

  /**
   * Create issue from conversation context
   */
  async createFromConversation(
    conversationData: IssueFromConversation,
    options: {
      repository: string;
      owner: string;
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<IssueCreateResult> {
    this.ensureInitialized();

    const { extractedContext, relevantMessages } = conversationData;

    // Generate title from context
    const title = this.generateTitle(extractedContext);

    // Generate body
    const body = this.generateBodyFromConversation(extractedContext, relevantMessages);

    return this.createIssue({
      userId: conversationData.userId,
      repository: options.repository,
      owner: options.owner,
      title,
      body,
      labels: options.labels,
      assignees: options.assignees,
      conversationId: conversationData.conversationId,
    });
  }

  /**
   * Extract issue context from conversation messages
   */
  extractContext(messages: ConversationMessage[]): ExtractedIssueContext {
    const limitedMessages = messages.slice(-this.config.maxContextMessages);

    // Extract problem statement (usually from user messages)
    const userMessages = limitedMessages.filter(m => m.role === 'user');
    const problem = userMessages.map(m => m.content).join('\n');

    // Extract error messages
    const errorMessages: string[] = [];
    const errorPatterns = [
      /Error:\s*(.+)/gi,
      /Exception:\s*(.+)/gi,
      /Failed:\s*(.+)/gi,
      /TypeError:\s*(.+)/gi,
      /ReferenceError:\s*(.+)/gi,
    ];

    for (const message of limitedMessages) {
      for (const pattern of errorPatterns) {
        let match;
        while ((match = pattern.exec(message.content)) !== null) {
          errorMessages.push(match[1]);
        }
      }
    }

    // Extract code references
    const codeReferences: CodeReference[] = [];
    if (this.config.includeCodeReferences) {
      const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
      const fileRefPattern = /(?:file|in)\s+[`']?([^\s`']+\.[a-z]+)[`']?(?:\s+(?:line|at)\s+(\d+))?/gi;

      for (const message of limitedMessages) {
        // Extract code blocks
        let match;
        while ((match = codeBlockPattern.exec(message.content)) !== null) {
          codeReferences.push({
            file: 'code-snippet',
            startLine: 0,
            endLine: 0,
            snippet: match[2],
            language: match[1],
          });
        }

        // Extract file references
        while ((match = fileRefPattern.exec(message.content)) !== null) {
          codeReferences.push({
            file: match[1],
            startLine: match[2] ? parseInt(match[2], 10) : 0,
            endLine: match[2] ? parseInt(match[2], 10) : 0,
            snippet: '',
          });
        }
      }
    }

    // Try to extract steps to reproduce
    const stepsToReproduce: string[] = [];
    const stepsPatterns = [
      /steps?\s*to\s*reproduce:?\s*([\s\S]*?)(?=expected|actual|$)/i,
      /(?:^\d+\.\s*.+$)+/gm,
    ];

    for (const pattern of stepsPatterns) {
      const match = problem.match(pattern);
      if (match) {
        const steps = match[0].split(/\n/).filter(s => s.trim());
        stepsToReproduce.push(...steps);
        break;
      }
    }

    // Try to extract expected/actual behavior
    let expectedBehavior: string | undefined;
    let actualBehavior: string | undefined;

    const expectedMatch = problem.match(/expected:?\s*([\s\S]*?)(?=actual|$)/i);
    if (expectedMatch) {
      expectedBehavior = expectedMatch[1].trim();
    }

    const actualMatch = problem.match(/actual:?\s*([\s\S]*?)(?=expected|$)/i);
    if (actualMatch) {
      actualBehavior = actualMatch[1].trim();
    }

    return {
      problem,
      stepsToReproduce: stepsToReproduce.length > 0 ? stepsToReproduce : undefined,
      expectedBehavior,
      actualBehavior,
      codeReferences: codeReferences.length > 0 ? codeReferences : undefined,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };
  }

  /**
   * Get an issue by ID
   */
  async getIssue(issueId: string): Promise<GitHubIssue | null> {
    this.ensureInitialized();
    return this.store.get(issueId);
  }

  /**
   * Get an issue by number
   */
  async getIssueByNumber(owner: string, repository: string, number: number): Promise<GitHubIssue | null> {
    this.ensureInitialized();
    return this.store.getByNumber(owner, repository, number);
  }

  /**
   * List issues
   */
  async listIssues(options?: CreatedIssueQueryOptions): Promise<GitHubIssue[]> {
    this.ensureInitialized();
    return this.store.list(options);
  }

  /**
   * List issues for a repository
   */
  async listRepositoryIssues(owner: string, repository: string): Promise<GitHubIssue[]> {
    this.ensureInitialized();
    return this.store.listByRepository(owner, repository);
  }

  /**
   * Update an issue (local record only)
   */
  async updateIssue(issueId: string, updates: Partial<GitHubIssue>): Promise<GitHubIssue | null> {
    this.ensureInitialized();
    return this.store.update(issueId, updates);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await this.github.shutdown();
    this.initialized = false;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private generateTitle(context: ExtractedIssueContext): string {
    // Try to generate a concise title from the problem
    const firstLine = context.problem.split('\n')[0];

    if (firstLine.length <= 80) {
      return firstLine;
    }

    // Truncate and add ellipsis
    return firstLine.substring(0, 77) + '...';
  }

  private generateBodyFromConversation(
    context: ExtractedIssueContext,
    messages: ConversationMessage[]
  ): string {
    let body = '## Description\n\n';
    body += context.problem + '\n\n';

    if (context.stepsToReproduce && context.stepsToReproduce.length > 0) {
      body += '## Steps to Reproduce\n\n';
      for (let i = 0; i < context.stepsToReproduce.length; i++) {
        const step = context.stepsToReproduce[i];
        // Remove existing numbering if present
        const cleanStep = step.replace(/^\d+\.\s*/, '');
        body += `${i + 1}. ${cleanStep}\n`;
      }
      body += '\n';
    }

    if (context.expectedBehavior) {
      body += '## Expected Behavior\n\n';
      body += context.expectedBehavior + '\n\n';
    }

    if (context.actualBehavior) {
      body += '## Actual Behavior\n\n';
      body += context.actualBehavior + '\n\n';
    }

    if (context.errorMessages && context.errorMessages.length > 0) {
      body += '## Error Messages\n\n';
      body += '```\n';
      body += context.errorMessages.join('\n');
      body += '\n```\n\n';
    }

    if (context.codeReferences && context.codeReferences.length > 0) {
      body += '## Code References\n\n';
      for (const ref of context.codeReferences) {
        if (ref.file !== 'code-snippet') {
          body += `- ${ref.file}`;
          if (ref.startLine > 0) {
            body += `:${ref.startLine}`;
          }
          body += '\n';
        } else if (ref.snippet) {
          body += '```' + (ref.language ?? '') + '\n';
          body += ref.snippet;
          body += '\n```\n\n';
        }
      }
    }

    if (this.config.includeConversationContext && messages.length > 0) {
      body += '## Conversation Context\n\n';
      body += '<details>\n<summary>Click to expand conversation</summary>\n\n';
      for (const msg of messages) {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        body += `**${role}:** ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}\n\n`;
      }
      body += '</details>\n\n';
    }

    body += '---\n';
    body += '*This issue was auto-generated from a conversation.*';

    return body;
  }

  private formatIssueBody(body: string, context?: ExtractedIssueContext): string {
    if (!context) {
      return body;
    }

    // If body is empty, generate from context
    if (!body.trim()) {
      return this.generateBodyFromConversation(context, []);
    }

    return body;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('IssueCreationService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create an issue creation service
 */
export function createIssueCreationService(
  store: CreatedIssueStore,
  config: IssueCreationServiceConfig
): IssueCreationService {
  return new IssueCreationService(store, config);
}
