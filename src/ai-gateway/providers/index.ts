/**
 * AI Gateway Providers
 *
 * Unified exports for all AI provider implementations
 */

// Base
export { BaseAIProvider, type AIProviderOptions } from './base.js';

// Provider implementations
export { OpenAIProvider, createOpenAIProvider } from './openai.js';
export { AnthropicProvider, createAnthropicProvider } from './anthropic.js';
export { GoogleProvider, createGoogleProvider } from './google.js';
export { GroqProvider, createGroqProvider } from './groq.js';
export { DeepSeekProvider, createDeepSeekProvider } from './deepseek.js';
export { OpenRouterProvider, createOpenRouterProvider, type OpenRouterProviderOptions } from './openrouter.js';

import type { AIProvider } from '../types.js';
import type { AIProviderOptions } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { GroqProvider } from './groq.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenRouterProvider, type OpenRouterProviderOptions } from './openrouter.js';

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  openai?: AIProviderOptions;
  anthropic?: AIProviderOptions;
  google?: AIProviderOptions;
  groq?: AIProviderOptions;
  deepseek?: AIProviderOptions;
  openrouter?: OpenRouterProviderOptions;
}

/**
 * Create a provider instance by type
 */
export function createProvider(
  provider: AIProvider,
  options: AIProviderOptions | OpenRouterProviderOptions
): OpenAIProvider | AnthropicProvider | GoogleProvider | GroqProvider | DeepSeekProvider | OpenRouterProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(options);
    case 'anthropic':
      return new AnthropicProvider(options);
    case 'google':
      return new GoogleProvider(options);
    case 'groq':
      return new GroqProvider(options);
    case 'deepseek':
      return new DeepSeekProvider(options);
    case 'openrouter':
      return new OpenRouterProvider(options as OpenRouterProviderOptions);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Provider environment variable names
 */
export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
  cohere: 'COHERE_API_KEY',
  together: 'TOGETHER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
};

/**
 * Default model for each provider
 */
export const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-pro',
  groq: 'llama-3.3-70b',
  deepseek: 'deepseek-chat',
  openrouter: 'openrouter/auto',
};

/**
 * Model display info for UI
 */
export interface ModelDisplayInfo {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  description: string;
  tier: 'economy' | 'standard' | 'premium' | 'flagship';
  costPer1MInput: number;
  costPer1MOutput: number;
  contextWindow: number;
  maxOutput: number;
  capabilities: string[];
  recommended?: boolean;
}

export const MODEL_DISPLAY_INFO: ModelDisplayInfo[] = [
  // Flagship models
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    providerName: 'Anthropic',
    description: 'Most capable model for complex reasoning and creative tasks',
    tier: 'flagship',
    costPer1MInput: 15.00,
    costPer1MOutput: 75.00,
    contextWindow: 200000,
    maxOutput: 32000,
    capabilities: ['chat', 'vision', 'tools', 'streaming'],
    recommended: true,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    providerName: 'OpenAI',
    description: 'Next-generation reasoning with advanced capabilities',
    tier: 'flagship',
    costPer1MInput: 5.00,
    costPer1MOutput: 15.00,
    contextWindow: 256000,
    maxOutput: 32768,
    capabilities: ['chat', 'vision', 'tools', 'streaming', 'json'],
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    providerName: 'Google',
    description: 'Largest context window (1M tokens) for complex analysis',
    tier: 'flagship',
    costPer1MInput: 1.25,
    costPer1MOutput: 5.00,
    contextWindow: 1000000,
    maxOutput: 65536,
    capabilities: ['chat', 'vision', 'tools', 'streaming'],
  },
  {
    id: 'llama-4-maverick-405b',
    name: 'Llama 4 Maverick 405B',
    provider: 'groq',
    providerName: 'Meta (via Groq)',
    description: 'Ultra-fast open-source flagship model',
    tier: 'flagship',
    costPer1MInput: 0.50,
    costPer1MOutput: 1.00,
    contextWindow: 128000,
    maxOutput: 32768,
    capabilities: ['chat', 'tools', 'streaming'],
  },

  // Premium models
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    providerName: 'Anthropic',
    description: 'Best balance of intelligence and speed',
    tier: 'premium',
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    contextWindow: 200000,
    maxOutput: 16000,
    capabilities: ['chat', 'vision', 'tools', 'streaming'],
    recommended: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    providerName: 'OpenAI',
    description: 'Fast multimodal model with strong performance',
    tier: 'premium',
    costPer1MInput: 2.50,
    costPer1MOutput: 10.00,
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: ['chat', 'vision', 'tools', 'streaming', 'json'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    providerName: 'DeepSeek',
    description: 'Advanced reasoning at fraction of the cost',
    tier: 'premium',
    costPer1MInput: 0.55,
    costPer1MOutput: 2.19,
    contextWindow: 64000,
    maxOutput: 8192,
    capabilities: ['chat', 'streaming'],
  },

  // Standard models
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    providerName: 'OpenAI',
    description: 'Fast and affordable for most tasks',
    tier: 'standard',
    costPer1MInput: 0.15,
    costPer1MOutput: 0.60,
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: ['chat', 'tools', 'streaming', 'json'],
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    providerName: 'Google',
    description: 'Fast and cost-effective with huge context',
    tier: 'standard',
    costPer1MInput: 0.075,
    costPer1MOutput: 0.30,
    contextWindow: 1000000,
    maxOutput: 65536,
    capabilities: ['chat', 'tools', 'streaming'],
  },
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    provider: 'groq',
    providerName: 'Meta (via Groq)',
    description: 'Fast open-source model with great performance',
    tier: 'standard',
    costPer1MInput: 0.15,
    costPer1MOutput: 0.30,
    contextWindow: 128000,
    maxOutput: 8192,
    capabilities: ['chat', 'tools', 'streaming'],
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    providerName: 'DeepSeek',
    description: 'Best cost-effectiveness for most tasks',
    tier: 'standard',
    costPer1MInput: 0.14,
    costPer1MOutput: 0.28,
    contextWindow: 64000,
    maxOutput: 8192,
    capabilities: ['chat', 'tools', 'streaming', 'json'],
    recommended: true,
  },

  // Economy models
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    providerName: 'Anthropic',
    description: 'Fast and affordable for simple tasks',
    tier: 'economy',
    costPer1MInput: 0.25,
    costPer1MOutput: 1.25,
    contextWindow: 200000,
    maxOutput: 4096,
    capabilities: ['chat', 'tools', 'streaming'],
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama 3.1 8B',
    provider: 'groq',
    providerName: 'Meta (via Groq)',
    description: 'Ultra-fast for simple tasks',
    tier: 'economy',
    costPer1MInput: 0.05,
    costPer1MOutput: 0.10,
    contextWindow: 128000,
    maxOutput: 8192,
    capabilities: ['chat', 'streaming'],
  },
];
