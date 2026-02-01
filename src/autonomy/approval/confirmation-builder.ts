/**
 * Confirmation Builder
 * Builds rich approval context for human-in-the-loop
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Goal,
  Plan,
  PlanStep,
  ActionClassification,
  EnrichedApprovalRequest,
  AlternativeAction,
} from '../types.js';

/**
 * Alternative generator
 */
export interface AlternativeGenerator {
  generate(
    step: PlanStep,
    classification: ActionClassification,
    context: { goal: Goal; plan: Plan }
  ): Promise<AlternativeAction[]>;
}

/**
 * Confirmation builder configuration
 */
export interface ConfirmationBuilderConfig {
  /** Approval timeout in ms */
  approvalTimeout?: number;
  /** Maximum alternatives to suggest */
  maxAlternatives?: number;
  /** Alternative generator */
  alternativeGenerator?: AlternativeGenerator;
  /** Enable alternative suggestions */
  suggestAlternatives?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<ConfirmationBuilderConfig, 'alternativeGenerator'>> = {
  approvalTimeout: 300000, // 5 minutes
  maxAlternatives: 3,
  suggestAlternatives: true,
};

/**
 * Confirmation Builder
 * Creates rich approval requests with context and alternatives
 */
export class ConfirmationBuilder extends EventEmitter {
  private readonly config: typeof DEFAULT_CONFIG;
  private readonly alternativeGenerator?: AlternativeGenerator;

  constructor(config?: ConfirmationBuilderConfig) {
    super();
    this.config = {
      approvalTimeout: config?.approvalTimeout ?? DEFAULT_CONFIG.approvalTimeout,
      maxAlternatives: config?.maxAlternatives ?? DEFAULT_CONFIG.maxAlternatives,
      suggestAlternatives: config?.suggestAlternatives ?? DEFAULT_CONFIG.suggestAlternatives,
    };
    this.alternativeGenerator = config?.alternativeGenerator;
  }

  /**
   * Build an enriched approval request
   */
  async build(
    step: PlanStep,
    classification: ActionClassification,
    context: {
      goal: Goal;
      plan: Plan;
      progressPercent?: number;
    }
  ): Promise<EnrichedApprovalRequest> {
    const { goal, plan, progressPercent = 0 } = context;

    // Generate alternatives if enabled
    let alternatives: AlternativeAction[] | undefined;
    if (this.config.suggestAlternatives) {
      alternatives = await this.generateAlternatives(step, classification, { goal, plan });
    }

    const request: EnrichedApprovalRequest = {
      id: randomUUID(),
      goal,
      plan,
      step,
      classification,
      progressPercent,
      alternatives,
      timeoutMs: this.config.approvalTimeout,
      requestedAt: Date.now(),
    };

    return request;
  }

  /**
   * Build a simple approval message
   */
  buildMessage(request: EnrichedApprovalRequest): string {
    const parts: string[] = [];

    // Header
    parts.push(`Approval Required: ${request.step.description}`);
    parts.push('');

    // Goal context
    parts.push(`Goal: ${request.goal.description}`);
    parts.push(`Progress: ${request.progressPercent}%`);
    parts.push('');

    // Action details
    if (request.step.toolName) {
      parts.push(`Tool: ${request.step.toolName}`);
      if (request.step.toolArguments) {
        parts.push(`Arguments: ${JSON.stringify(request.step.toolArguments, null, 2)}`);
      }
    }
    parts.push('');

    // Risk assessment
    parts.push(`Risk Level: ${request.classification.riskLevel}/10`);
    parts.push(`Categories: ${request.classification.categories.join(', ') || 'None'}`);
    parts.push(`Reason: ${request.classification.explanation}`);
    parts.push('');

    // Alternatives
    if (request.alternatives && request.alternatives.length > 0) {
      parts.push('Alternatives:');
      for (let i = 0; i < request.alternatives.length; i++) {
        const alt = request.alternatives[i];
        parts.push(`  ${i + 1}. ${alt.description}${alt.recommended ? ' (Recommended)' : ''}`);
      }
      parts.push('');
    }

    // Timeout
    const timeoutMinutes = Math.round(request.timeoutMs / 60000);
    parts.push(`Timeout: ${timeoutMinutes} minutes`);

    return parts.join('\n');
  }

  /**
   * Build an HTML-formatted approval request
   */
  buildHTML(request: EnrichedApprovalRequest): string {
    const riskColor = this.getRiskColor(request.classification.riskLevel);

    let html = `
<div class="approval-request">
  <h2>Approval Required</h2>
  <p class="step-description">${this.escapeHtml(request.step.description)}</p>

  <div class="context">
    <h3>Context</h3>
    <p><strong>Goal:</strong> ${this.escapeHtml(request.goal.description)}</p>
    <div class="progress-bar">
      <div class="progress" style="width: ${request.progressPercent}%"></div>
    </div>
    <p class="progress-text">${request.progressPercent}% complete</p>
  </div>

  <div class="action-details">
    <h3>Action Details</h3>
    ${request.step.toolName ? `<p><strong>Tool:</strong> ${this.escapeHtml(request.step.toolName)}</p>` : ''}
    ${request.step.toolArguments ? `<pre>${this.escapeHtml(JSON.stringify(request.step.toolArguments, null, 2))}</pre>` : ''}
  </div>

  <div class="risk-assessment" style="border-color: ${riskColor}">
    <h3>Risk Assessment</h3>
    <p><strong>Risk Level:</strong> <span style="color: ${riskColor}">${request.classification.riskLevel}/10</span></p>
    <p><strong>Categories:</strong> ${request.classification.categories.map(c => `<span class="category">${c}</span>`).join(' ')}</p>
    <p><strong>Explanation:</strong> ${this.escapeHtml(request.classification.explanation)}</p>
  </div>`;

    if (request.alternatives && request.alternatives.length > 0) {
      html += `
  <div class="alternatives">
    <h3>Alternatives</h3>
    <ul>
      ${request.alternatives.map((alt, i) => `
        <li class="${alt.recommended ? 'recommended' : ''}">
          <strong>${alt.description}</strong>
          <span class="risk">Risk: ${alt.riskLevel}/10</span>
          ${alt.recommended ? '<span class="badge">Recommended</span>' : ''}
        </li>
      `).join('')}
    </ul>
  </div>`;
    }

    html += `
  <div class="actions">
    <button class="approve">Approve</button>
    <button class="deny">Deny</button>
  </div>

  <p class="timeout">Expires in ${Math.round(request.timeoutMs / 60000)} minutes</p>
</div>`;

    return html;
  }

  /**
   * Build a JSON-serializable approval request
   */
  buildJSON(request: EnrichedApprovalRequest): Record<string, unknown> {
    return {
      id: request.id,
      type: 'approval_request',
      action: {
        description: request.step.description,
        toolName: request.step.toolName,
        toolArguments: request.step.toolArguments,
      },
      context: {
        goal: request.goal.description,
        goalId: request.goal.id,
        planId: request.plan.id,
        progress: request.progressPercent,
        currentStep: request.plan.currentStepIndex + 1,
        totalSteps: request.plan.steps.length,
      },
      risk: {
        level: request.classification.riskLevel,
        categories: request.classification.categories,
        isSensitive: request.classification.isSensitive,
        explanation: request.classification.explanation,
      },
      alternatives: request.alternatives?.map(alt => ({
        description: alt.description,
        riskLevel: alt.riskLevel,
        recommended: alt.recommended,
        toolName: alt.toolName,
        toolArguments: alt.toolArguments,
      })),
      metadata: {
        requestedAt: request.requestedAt,
        timeoutMs: request.timeoutMs,
        expiresAt: request.requestedAt + request.timeoutMs,
      },
    };
  }

  /**
   * Generate alternative actions
   */
  private async generateAlternatives(
    step: PlanStep,
    classification: ActionClassification,
    context: { goal: Goal; plan: Plan }
  ): Promise<AlternativeAction[]> {
    const alternatives: AlternativeAction[] = [];

    // Use custom generator if provided
    if (this.alternativeGenerator) {
      try {
        const generated = await this.alternativeGenerator.generate(step, classification, context);
        alternatives.push(...generated.slice(0, this.config.maxAlternatives));
      } catch {
        // Fall back to built-in alternatives
      }
    }

    // Add built-in alternatives if we have room
    if (alternatives.length < this.config.maxAlternatives) {
      const builtIn = this.generateBuiltInAlternatives(step, classification);
      for (const alt of builtIn) {
        if (alternatives.length >= this.config.maxAlternatives) break;
        alternatives.push(alt);
      }
    }

    return alternatives;
  }

  /**
   * Generate built-in alternatives
   */
  private generateBuiltInAlternatives(
    step: PlanStep,
    classification: ActionClassification
  ): AlternativeAction[] {
    const alternatives: AlternativeAction[] = [];

    // Skip this step
    alternatives.push({
      description: 'Skip this step and continue',
      riskLevel: 1,
      recommended: classification.riskLevel >= 8,
    });

    // Dry run if available
    if (step.toolName) {
      alternatives.push({
        description: 'Perform a dry run (preview only)',
        toolName: step.toolName,
        toolArguments: { ...step.toolArguments, _dryRun: true },
        riskLevel: 2,
        recommended: classification.categories.includes('irreversible_action'),
      });
    }

    // Request more information
    alternatives.push({
      description: 'Request more context before proceeding',
      riskLevel: 1,
      recommended: false,
    });

    return alternatives;
  }

  /**
   * Get color for risk level
   */
  private getRiskColor(riskLevel: number): string {
    if (riskLevel <= 3) return '#22c55e'; // Green
    if (riskLevel <= 5) return '#eab308'; // Yellow
    if (riskLevel <= 7) return '#f97316'; // Orange
    return '#ef4444'; // Red
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * Create a confirmation builder
 */
export function createConfirmationBuilder(
  config?: ConfirmationBuilderConfig
): ConfirmationBuilder {
  return new ConfirmationBuilder(config);
}
