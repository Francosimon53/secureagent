/**
 * Persona Presets
 * Exports all preset persona configurations
 */

import type { AgentPersona, PersonaType } from '../../types.js';

// Export individual personas
export {
  developerPersona,
  createDeveloperPersona,
} from './developer.js';

export {
  marketingPersona,
  createMarketingPersona,
} from './marketing.js';

export {
  researchPersona,
  createResearchPersona,
} from './research.js';

export {
  businessPersona,
  createBusinessPersona,
} from './business.js';

// Re-import for collection
import { developerPersona } from './developer.js';
import { marketingPersona } from './marketing.js';
import { researchPersona } from './research.js';
import { businessPersona } from './business.js';

/**
 * All preset personas
 */
export const presetPersonas: AgentPersona[] = [
  developerPersona,
  marketingPersona,
  researchPersona,
  businessPersona,
];

/**
 * Preset personas by type
 */
export const presetPersonasByType: Record<Exclude<PersonaType, 'custom'>, AgentPersona> = {
  developer: developerPersona,
  marketing: marketingPersona,
  research: researchPersona,
  business: businessPersona,
};

/**
 * Get a preset persona by type
 */
export function getPresetPersona(type: Exclude<PersonaType, 'custom'>): AgentPersona {
  const persona = presetPersonasByType[type];
  if (!persona) {
    throw new Error(`Unknown preset persona type: ${type}`);
  }
  return persona;
}

/**
 * Check if a persona type has a preset
 */
export function hasPreset(type: PersonaType): type is Exclude<PersonaType, 'custom'> {
  return type !== 'custom' && type in presetPersonasByType;
}
