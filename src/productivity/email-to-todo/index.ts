/**
 * Email to Todo Service
 *
 * Automatically extracts tasks from emails and creates todo items.
 */

import type {
  EmailDigest,
  ExtractedTask,
  TodoItem,
  TodoContext,
  TodoPriority,
} from '../types.js';
import type { EmailToTodoConfig } from '../config.js';
import type { EmailProvider } from '../providers/email.js';
import type { TodoStore } from '../stores/productivity-store.js';
import {
  extractTasksFromEmail,
  isLikelyActionable,
  calculateActionabilityScore,
} from './task-extractor.js';

// Re-export utilities
export {
  extractTasksFromEmail,
  isLikelyActionable,
  calculateActionabilityScore,
};

/**
 * Extracted email task with source info
 */
export interface EmailTaskCandidate {
  task: ExtractedTask;
  email: EmailDigest;
  actionabilityScore: number;
  approved: boolean;
}

/**
 * Task creation result
 */
export interface TaskCreationResult {
  success: boolean;
  todoItem?: TodoItem;
  error?: string;
}

/**
 * Email to Todo Service
 */
export class EmailToTodoService {
  private readonly confidenceThreshold: number;
  private readonly defaultPriority: TodoPriority;
  private readonly defaultContext: TodoContext;
  private readonly autoCreateTasks: boolean;
  private readonly requireApproval: boolean;

  constructor(
    private readonly emailProvider: EmailProvider,
    private readonly todoStore: TodoStore,
    config?: Partial<EmailToTodoConfig>
  ) {
    this.confidenceThreshold = config?.confidenceThreshold ?? 0.6;
    this.defaultPriority = config?.defaultPriority ?? 'medium';
    this.defaultContext = config?.defaultContext ?? 'work';
    this.autoCreateTasks = config?.autoCreateTasks ?? false;
    this.requireApproval = config?.requireApproval ?? true;
  }

  /**
   * Scan emails for potential tasks
   */
  async scanForTasks(maxEmails = 50): Promise<EmailTaskCandidate[]> {
    const result = await this.emailProvider.getEmails({
      maxResults: maxEmails,
      unreadOnly: true,
    });

    if (!result.success || !result.data) {
      return [];
    }

    const candidates: EmailTaskCandidate[] = [];

    for (const email of result.data) {
      const emailCandidates = await this.extractFromEmail(email);
      candidates.push(...emailCandidates);
    }

    // Sort by actionability score
    candidates.sort((a, b) => b.actionabilityScore - a.actionabilityScore);

    return candidates;
  }

  /**
   * Extract tasks from a single email
   */
  async extractFromEmail(email: EmailDigest): Promise<EmailTaskCandidate[]> {
    // Check if email is likely actionable
    const actionabilityScore = calculateActionabilityScore(email.subject, email.snippet);

    if (actionabilityScore < 0.2) {
      return []; // Skip emails that are unlikely to contain tasks
    }

    // Extract tasks
    const tasks = extractTasksFromEmail(email.subject, email.snippet);

    // Filter by confidence threshold
    const qualifiedTasks = tasks.filter(t => t.confidence >= this.confidenceThreshold);

    return qualifiedTasks.map(task => ({
      task,
      email,
      actionabilityScore,
      approved: false,
    }));
  }

  /**
   * Create a todo item from an email task
   */
  async createTaskFromEmail(
    userId: string,
    candidate: EmailTaskCandidate
  ): Promise<TaskCreationResult> {
    if (this.requireApproval && !candidate.approved) {
      return {
        success: false,
        error: 'Task requires approval before creation',
      };
    }

    try {
      const todoItem = await this.todoStore.create({
        userId,
        title: candidate.task.title,
        description: candidate.task.description ?? `Extracted from email: ${candidate.email.subject}`,
        status: 'pending',
        priority: candidate.task.priority ?? this.defaultPriority,
        dueDate: candidate.task.dueDate,
        context: this.defaultContext,
        tags: ['email-extracted'],
        sourceType: 'email',
        sourceId: candidate.email.id,
      });

      return {
        success: true,
        todoItem,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  }

  /**
   * Batch create tasks from candidates
   */
  async batchCreateTasks(
    userId: string,
    candidates: EmailTaskCandidate[]
  ): Promise<{ created: TodoItem[]; failed: Array<{ candidate: EmailTaskCandidate; error: string }> }> {
    const created: TodoItem[] = [];
    const failed: Array<{ candidate: EmailTaskCandidate; error: string }> = [];

    for (const candidate of candidates) {
      const result = await this.createTaskFromEmail(userId, candidate);

      if (result.success && result.todoItem) {
        created.push(result.todoItem);
      } else {
        failed.push({ candidate, error: result.error ?? 'Unknown error' });
      }
    }

    return { created, failed };
  }

  /**
   * Approve a task candidate for creation
   */
  approveCandidate(candidate: EmailTaskCandidate): EmailTaskCandidate {
    return {
      ...candidate,
      approved: true,
    };
  }

  /**
   * Approve multiple candidates
   */
  approveCandidates(candidates: EmailTaskCandidate[]): EmailTaskCandidate[] {
    return candidates.map(c => this.approveCandidate(c));
  }

  /**
   * Get high-confidence task candidates (auto-approvable)
   */
  async getHighConfidenceTasks(minConfidence = 0.8): Promise<EmailTaskCandidate[]> {
    const allCandidates = await this.scanForTasks();

    return allCandidates.filter(c => c.task.confidence >= minConfidence);
  }

  /**
   * Auto-process emails and create tasks if enabled
   */
  async autoProcess(userId: string): Promise<AutoProcessResult> {
    if (!this.autoCreateTasks) {
      return {
        processed: 0,
        tasksCreated: 0,
        pendingApproval: [],
        errors: [],
      };
    }

    const candidates = await this.scanForTasks();
    const highConfidence = candidates.filter(c => c.task.confidence >= 0.8);
    const needsApproval = candidates.filter(c => c.task.confidence < 0.8);

    // Auto-approve high confidence tasks
    const approved = this.approveCandidates(highConfidence);
    const { created, failed } = await this.batchCreateTasks(userId, approved);

    return {
      processed: candidates.length,
      tasksCreated: created.length,
      pendingApproval: needsApproval,
      errors: failed.map(f => f.error),
    };
  }

  /**
   * Check if an email has already been processed
   */
  async isEmailProcessed(userId: string, emailId: string): Promise<boolean> {
    const existingTasks = await this.todoStore.list(userId, {
      sourceType: 'email',
    });

    return existingTasks.some(t => t.sourceId === emailId);
  }

  /**
   * Get tasks created from emails
   */
  async getEmailTasks(userId: string): Promise<TodoItem[]> {
    return this.todoStore.list(userId, {
      sourceType: 'email',
    });
  }

  /**
   * Get summary of email-to-task pipeline
   */
  async getSummary(userId: string): Promise<EmailToTodoSummary> {
    const candidates = await this.scanForTasks();
    const existingTasks = await this.getEmailTasks(userId);

    return {
      pendingCandidates: candidates.length,
      highConfidenceCandidates: candidates.filter(c => c.task.confidence >= 0.8).length,
      existingEmailTasks: existingTasks.length,
      completedEmailTasks: existingTasks.filter(t => t.status === 'completed').length,
      averageConfidence: candidates.length > 0
        ? candidates.reduce((sum, c) => sum + c.task.confidence, 0) / candidates.length
        : 0,
    };
  }
}

/**
 * Auto-process result
 */
export interface AutoProcessResult {
  processed: number;
  tasksCreated: number;
  pendingApproval: EmailTaskCandidate[];
  errors: string[];
}

/**
 * Email to todo summary
 */
export interface EmailToTodoSummary {
  pendingCandidates: number;
  highConfidenceCandidates: number;
  existingEmailTasks: number;
  completedEmailTasks: number;
  averageConfidence: number;
}

/**
 * Create an email to todo service
 */
export function createEmailToTodoService(
  emailProvider: EmailProvider,
  todoStore: TodoStore,
  config?: Partial<EmailToTodoConfig>
): EmailToTodoService {
  return new EmailToTodoService(emailProvider, todoStore, config);
}
