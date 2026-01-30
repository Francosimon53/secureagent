/**
 * Cost Estimator
 *
 * Estimates token counts and costs for AI requests before execution
 */

import type {
  AIProvider,
  AIRequestOptions,
  AIMessage,
  AIContentPart,
  CostEstimate,
  ModelInfo,
} from './types.js';
import type { ProviderRegistry } from './provider-registry.js';
import { MODEL_PRICING, AI_GATEWAY_DEFAULTS } from './constants.js';

// =============================================================================
// Token Counter
// =============================================================================

export class TokenCounter {
  private readonly charsPerToken: number;

  constructor(charsPerToken: number = AI_GATEWAY_DEFAULTS.CHARS_PER_TOKEN) {
    this.charsPerToken = charsPerToken;
  }

  /**
   * Estimate token count for a string
   */
  countTokens(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Estimate token count for messages
   */
  countMessageTokens(messages: AIMessage[]): number {
    let total = 0;

    for (const msg of messages) {
      // Add overhead for message structure
      total += 4; // role, content markers

      if (typeof msg.content === 'string') {
        total += this.countTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            total += this.countTokens(part.text);
          } else if (part.type === 'image_url' || part.type === 'image_base64') {
            // Images typically count as ~85 tokens for low detail, ~170 for high
            total += 170;
          }
        }
      }

      if (msg.name) {
        total += this.countTokens(msg.name) + 1;
      }

      if (msg.toolCalls) {
        for (const call of msg.toolCalls) {
          total += this.countTokens(call.function.name);
          total += this.countTokens(call.function.arguments);
          total += 10; // Overhead for tool call structure
        }
      }
    }

    return total;
  }

  /**
   * Estimate token count for tools
   */
  countToolTokens(tools: AIRequestOptions['tools']): number {
    if (!tools?.length) return 0;

    let total = 0;
    for (const tool of tools) {
      total += this.countTokens(tool.function.name);
      if (tool.function.description) {
        total += this.countTokens(tool.function.description);
      }
      if (tool.function.parameters) {
        total += this.countTokens(JSON.stringify(tool.function.parameters));
      }
      total += 10; // Overhead for tool structure
    }

    return total;
  }
}

// =============================================================================
// Cost Estimator
// =============================================================================

export interface CostEstimatorConfig {
  /** Characters per token estimate */
  charsPerToken: number;
  /** Average completion ratio (output/input) */
  avgCompletionRatio: number;
  /** Confidence adjustment factor */
  confidenceAdjustment: number;
}

const DEFAULT_CONFIG: CostEstimatorConfig = {
  charsPerToken: AI_GATEWAY_DEFAULTS.CHARS_PER_TOKEN,
  avgCompletionRatio: 0.5,
  confidenceAdjustment: 0.2,
};

export class CostEstimator {
  private readonly config: CostEstimatorConfig;
  private readonly tokenCounter: TokenCounter;

  constructor(
    private readonly registry: ProviderRegistry,
    config?: Partial<CostEstimatorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenCounter = new TokenCounter(this.config.charsPerToken);
  }

  /**
   * Estimate cost for a request
   */
  estimate(request: AIRequestOptions, modelId?: string): CostEstimate {
    const model = modelId
      ? this.registry.getModel(modelId)
      : this.registry.getAllModels().find(m => m.id === request.model);

    if (!model) {
      // Use default pricing
      return this.estimateWithPricing(request, 'default', 'openai');
    }

    return this.estimateWithModel(request, model);
  }

  /**
   * Estimate cost for multiple models
   */
  estimateMultiple(request: AIRequestOptions, modelIds: string[]): CostEstimate[] {
    return modelIds.map(id => this.estimate(request, id));
  }

  /**
   * Find cheapest model for a request
   */
  findCheapestModel(request: AIRequestOptions, modelIds?: string[]): CostEstimate | undefined {
    const models = modelIds?.length
      ? modelIds.map(id => this.registry.getModel(id)).filter((m): m is ModelInfo => !!m)
      : this.registry.getEnabledModels();

    if (models.length === 0) return undefined;

    const estimates = models.map(model => this.estimateWithModel(request, model));
    estimates.sort((a, b) => a.estimatedCostCents - b.estimatedCostCents);

    return estimates[0];
  }

  /**
   * Calculate actual cost from usage
   */
  calculateActualCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const model = this.registry.getModel(modelId);

    if (model) {
      return (
        inputTokens * model.costPerInputToken +
        outputTokens * model.costPerOutputToken
      ) * 100; // Convert to cents
    }

    const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING['default'];
    return (
      (inputTokens * pricing.input + outputTokens * pricing.output) / 10000
    ); // Convert from per 1M to actual cents
  }

  /**
   * Get cost per 1K tokens for a model
   */
  getCostPer1K(modelId: string): { input: number; output: number } {
    const model = this.registry.getModel(modelId);

    if (model) {
      return {
        input: model.costPerInputToken * 1000 * 100, // Convert to cents per 1K
        output: model.costPerOutputToken * 1000 * 100,
      };
    }

    const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING['default'];
    return {
      input: pricing.input / 1000, // MODEL_PRICING is per 1M, convert to per 1K
      output: pricing.output / 1000,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private estimateWithModel(request: AIRequestOptions, model: ModelInfo): CostEstimate {
    const inputTokens = this.estimateInputTokens(request);
    const outputTokens = this.estimateOutputTokens(request, model);

    const inputCost = inputTokens * model.costPerInputToken * 100;
    const outputCost = outputTokens * model.costPerOutputToken * 100;
    const estimatedCost = inputCost + outputCost;

    // Calculate confidence based on whether max_tokens is specified
    const confidence = request.maxTokens ? 0.9 : 0.7;

    return {
      model: model.id,
      provider: model.provider,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedCostCents: estimatedCost,
      minCostCents: inputCost, // Minimum is just input cost
      maxCostCents: this.calculateMaxCost(inputTokens, model),
      confidence,
    };
  }

  private estimateWithPricing(
    request: AIRequestOptions,
    pricingKey: string,
    provider: AIProvider
  ): CostEstimate {
    const pricing = MODEL_PRICING[pricingKey] ?? MODEL_PRICING['default'];
    const inputTokens = this.estimateInputTokens(request);
    const outputTokens = request.maxTokens ?? Math.ceil(inputTokens * this.config.avgCompletionRatio);

    const inputCost = (inputTokens * pricing.input) / 10000;
    const outputCost = (outputTokens * pricing.output) / 10000;

    return {
      model: pricingKey,
      provider,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedCostCents: inputCost + outputCost,
      minCostCents: inputCost,
      maxCostCents: inputCost + (4096 * pricing.output) / 10000,
      confidence: 0.5,
    };
  }

  private estimateInputTokens(request: AIRequestOptions): number {
    let total = 0;

    // Count message tokens
    total += this.tokenCounter.countMessageTokens(request.messages);

    // Count tool tokens
    if (request.tools) {
      total += this.tokenCounter.countToolTokens(request.tools);
    }

    // Add overhead for system prompt and formatting
    total += 50;

    return total;
  }

  private estimateOutputTokens(request: AIRequestOptions, model: ModelInfo): number {
    if (request.maxTokens) {
      // Use a fraction of max tokens as the estimate
      return Math.ceil(request.maxTokens * 0.5);
    }

    // Estimate based on input size and model's max output
    const inputTokens = this.estimateInputTokens(request);
    const estimated = Math.ceil(inputTokens * this.config.avgCompletionRatio);

    // Cap at model's max output tokens
    const maxOutput = model.maxOutputTokens ?? 4096;
    return Math.min(estimated, maxOutput);
  }

  private calculateMaxCost(inputTokens: number, model: ModelInfo): number {
    const maxOutputTokens = model.maxOutputTokens ?? 4096;
    const inputCost = inputTokens * model.costPerInputToken * 100;
    const maxOutputCost = maxOutputTokens * model.costPerOutputToken * 100;
    return inputCost + maxOutputCost;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCostEstimator(
  registry: ProviderRegistry,
  config?: Partial<CostEstimatorConfig>
): CostEstimator {
  return new CostEstimator(registry, config);
}
