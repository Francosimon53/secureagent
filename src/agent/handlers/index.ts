/**
 * Message Handlers Index
 *
 * Exports all LLM message handler implementations.
 */

// Anthropic/Claude Handler
export {
  AnthropicHandler,
  createAnthropicHandler,
  createClaudeSonnetHandler,
  createClaudeOpusHandler,
  createClaudeHaikuHandler,
  type AnthropicHandlerConfig,
  type AnthropicModel,
} from './anthropic-handler.js';

// OpenAI/GPT Handler
export {
  OpenAIHandler,
  createOpenAIHandler,
  createGPT4oHandler,
  createGPT4oMiniHandler,
  type OpenAIHandlerConfig,
  type OpenAIModel,
} from './openai-handler.js';
