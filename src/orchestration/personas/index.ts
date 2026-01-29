/**
 * Personas Module
 * Exports persona registry and preset personas
 */

// Registry
export {
  PersonaRegistry,
  initPersonaRegistry,
  getPersonaRegistry,
  isPersonaRegistryInitialized,
  type RegisterPersonaOptions,
  type CreateCustomPersonaOptions,
  type PersonaRegistryEvents,
} from './persona-registry.js';

// Presets
export {
  // Individual personas
  developerPersona,
  createDeveloperPersona,
  marketingPersona,
  createMarketingPersona,
  researchPersona,
  createResearchPersona,
  businessPersona,
  createBusinessPersona,
  // Collections
  presetPersonas,
  presetPersonasByType,
  // Utilities
  getPresetPersona,
  hasPreset,
} from './presets/index.js';
