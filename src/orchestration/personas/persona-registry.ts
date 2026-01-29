/**
 * Persona Registry
 * Manages agent persona registration and retrieval
 */

import { EventEmitter } from 'events';
import type { AgentPersona, PersonaType, ModelTier, ModelId, ModelConfig } from '../types.js';
import { presetPersonas, hasPreset, getPresetPersona } from './presets/index.js';

/**
 * Model tier to model ID mapping
 */
const MODEL_TIER_MAP: Record<ModelTier, ModelId> = {
  fast: 'claude-3-haiku',
  balanced: 'claude-3-sonnet',
  powerful: 'claude-3-opus',
};

/**
 * Default model configurations by tier
 */
const DEFAULT_MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  fast: {
    tier: 'fast',
    modelId: 'claude-3-haiku',
    maxTokens: 2048,
    temperature: 0.5,
  },
  balanced: {
    tier: 'balanced',
    modelId: 'claude-3-sonnet',
    maxTokens: 4096,
    temperature: 0.5,
  },
  powerful: {
    tier: 'powerful',
    modelId: 'claude-3-opus',
    maxTokens: 8192,
    temperature: 0.3,
  },
};

/**
 * Persona registration options
 */
export interface RegisterPersonaOptions {
  /** Override existing persona if exists */
  override?: boolean;
}

/**
 * Custom persona creation options
 */
export interface CreateCustomPersonaOptions {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** System prompt */
  systemPrompt: string;
  /** Model tier to use */
  modelTier?: ModelTier;
  /** Custom model config (overrides tier) */
  modelConfig?: Partial<ModelConfig>;
  /** Capabilities list */
  capabilities?: string[];
  /** Constraints list */
  constraints?: string[];
  /** Communication tone */
  tone?: AgentPersona['tone'];
}

/**
 * Persona registry events
 */
export interface PersonaRegistryEvents {
  'persona:registered': (persona: AgentPersona) => void;
  'persona:unregistered': (personaId: string) => void;
  'persona:updated': (persona: AgentPersona) => void;
}

/**
 * Registry for managing agent personas
 */
export class PersonaRegistry extends EventEmitter {
  private personas: Map<string, AgentPersona> = new Map();
  private defaultModelTier: ModelTier = 'balanced';

  constructor(options?: { enablePresets?: boolean; defaultModelTier?: ModelTier }) {
    super();

    if (options?.defaultModelTier) {
      this.defaultModelTier = options.defaultModelTier;
    }

    // Load preset personas if enabled
    if (options?.enablePresets !== false) {
      this.loadPresets();
    }
  }

  /**
   * Load all preset personas
   */
  private loadPresets(): void {
    for (const persona of presetPersonas) {
      this.personas.set(persona.id, persona);
    }
  }

  /**
   * Get model ID for a tier
   */
  getModelIdForTier(tier: ModelTier): ModelId {
    return MODEL_TIER_MAP[tier];
  }

  /**
   * Get default model config for a tier
   */
  getDefaultModelConfig(tier: ModelTier): ModelConfig {
    return { ...DEFAULT_MODEL_CONFIGS[tier] };
  }

  /**
   * Register a custom persona
   */
  register(persona: AgentPersona, options?: RegisterPersonaOptions): void {
    if (this.personas.has(persona.id) && !options?.override) {
      throw new Error(`Persona with ID '${persona.id}' already exists. Use override: true to replace.`);
    }

    this.personas.set(persona.id, { ...persona });
    this.emit('persona:registered', persona);
  }

  /**
   * Unregister a persona
   */
  unregister(personaId: string): boolean {
    const existed = this.personas.has(personaId);
    if (existed) {
      this.personas.delete(personaId);
      this.emit('persona:unregistered', personaId);
    }
    return existed;
  }

  /**
   * Get a persona by ID
   */
  get(personaId: string): AgentPersona | null {
    return this.personas.get(personaId) || null;
  }

  /**
   * Get a persona by type (returns first match)
   */
  getByType(type: PersonaType): AgentPersona | null {
    for (const persona of this.personas.values()) {
      if (persona.type === type) {
        return persona;
      }
    }
    return null;
  }

  /**
   * Get all personas
   */
  getAll(): AgentPersona[] {
    return Array.from(this.personas.values());
  }

  /**
   * Get all personas of a specific type
   */
  getAllByType(type: PersonaType): AgentPersona[] {
    return Array.from(this.personas.values()).filter(p => p.type === type);
  }

  /**
   * Check if a persona exists
   */
  has(personaId: string): boolean {
    return this.personas.has(personaId);
  }

  /**
   * Create a custom persona
   */
  createCustomPersona(options: CreateCustomPersonaOptions): AgentPersona {
    const modelTier = options.modelTier || this.defaultModelTier;
    const baseModelConfig = this.getDefaultModelConfig(modelTier);

    const persona: AgentPersona = {
      id: options.id,
      name: options.name,
      type: 'custom',
      description: options.description,
      systemPrompt: options.systemPrompt,
      modelConfig: {
        ...baseModelConfig,
        ...options.modelConfig,
      },
      capabilities: options.capabilities || [],
      constraints: options.constraints,
      tone: options.tone || 'formal',
    };

    return persona;
  }

  /**
   * Create and register a custom persona
   */
  registerCustomPersona(
    options: CreateCustomPersonaOptions,
    registerOptions?: RegisterPersonaOptions
  ): AgentPersona {
    const persona = this.createCustomPersona(options);
    this.register(persona, registerOptions);
    return persona;
  }

  /**
   * Clone a persona with modifications
   */
  clone(personaId: string, newId: string, modifications?: Partial<AgentPersona>): AgentPersona {
    const original = this.get(personaId);
    if (!original) {
      throw new Error(`Persona '${personaId}' not found`);
    }

    const cloned: AgentPersona = {
      ...original,
      ...modifications,
      id: newId,
      modelConfig: {
        ...original.modelConfig,
        ...modifications?.modelConfig,
      },
      capabilities: [
        ...original.capabilities,
        ...(modifications?.capabilities || []),
      ],
      constraints: [
        ...(original.constraints || []),
        ...(modifications?.constraints || []),
      ],
    };

    return cloned;
  }

  /**
   * Clone and register a persona
   */
  cloneAndRegister(
    personaId: string,
    newId: string,
    modifications?: Partial<AgentPersona>,
    registerOptions?: RegisterPersonaOptions
  ): AgentPersona {
    const cloned = this.clone(personaId, newId, modifications);
    this.register(cloned, registerOptions);
    return cloned;
  }

  /**
   * Update a persona
   */
  update(personaId: string, updates: Partial<AgentPersona>): AgentPersona {
    const existing = this.get(personaId);
    if (!existing) {
      throw new Error(`Persona '${personaId}' not found`);
    }

    const updated: AgentPersona = {
      ...existing,
      ...updates,
      id: personaId, // Prevent ID changes
      modelConfig: {
        ...existing.modelConfig,
        ...updates.modelConfig,
      },
    };

    this.personas.set(personaId, updated);
    this.emit('persona:updated', updated);
    return updated;
  }

  /**
   * Get personas by capability
   */
  getByCapability(capability: string): AgentPersona[] {
    return Array.from(this.personas.values()).filter(
      p => p.capabilities.includes(capability)
    );
  }

  /**
   * Find best matching persona for capabilities
   */
  findBestMatch(requiredCapabilities: string[]): AgentPersona | null {
    let bestMatch: AgentPersona | null = null;
    let bestScore = 0;

    for (const persona of this.personas.values()) {
      const matchCount = requiredCapabilities.filter(
        cap => persona.capabilities.includes(cap)
      ).length;

      const score = matchCount / requiredCapabilities.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = persona;
      }
    }

    return bestMatch;
  }

  /**
   * Get preset persona by type (throws if not found)
   */
  getPreset(type: Exclude<PersonaType, 'custom'>): AgentPersona {
    return getPresetPersona(type);
  }

  /**
   * Check if type has a preset
   */
  hasPreset(type: PersonaType): boolean {
    return hasPreset(type);
  }

  /**
   * Reset to only preset personas
   */
  reset(): void {
    this.personas.clear();
    this.loadPresets();
  }

  /**
   * Get persona count
   */
  get size(): number {
    return this.personas.size;
  }

  /**
   * Validate a persona configuration
   */
  validate(persona: Partial<AgentPersona>): string[] {
    const errors: string[] = [];

    if (!persona.id) {
      errors.push('Persona must have an ID');
    }

    if (!persona.name) {
      errors.push('Persona must have a name');
    }

    if (!persona.type) {
      errors.push('Persona must have a type');
    }

    if (!persona.systemPrompt) {
      errors.push('Persona must have a system prompt');
    }

    if (!persona.modelConfig) {
      errors.push('Persona must have a model configuration');
    } else {
      if (!persona.modelConfig.modelId) {
        errors.push('Model configuration must have a model ID');
      }
      if (persona.modelConfig.maxTokens !== undefined && persona.modelConfig.maxTokens <= 0) {
        errors.push('Max tokens must be positive');
      }
      if (persona.modelConfig.temperature !== undefined &&
          (persona.modelConfig.temperature < 0 || persona.modelConfig.temperature > 2)) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    return errors;
  }
}

// Global persona registry instance
let globalPersonaRegistry: PersonaRegistry | null = null;

/**
 * Initialize the global persona registry
 */
export function initPersonaRegistry(options?: {
  enablePresets?: boolean;
  defaultModelTier?: ModelTier;
}): PersonaRegistry {
  globalPersonaRegistry = new PersonaRegistry(options);
  return globalPersonaRegistry;
}

/**
 * Get the global persona registry
 */
export function getPersonaRegistry(): PersonaRegistry {
  if (!globalPersonaRegistry) {
    globalPersonaRegistry = new PersonaRegistry();
  }
  return globalPersonaRegistry;
}

/**
 * Check if persona registry is initialized
 */
export function isPersonaRegistryInitialized(): boolean {
  return globalPersonaRegistry !== null;
}
