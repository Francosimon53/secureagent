/**
 * Wellness Stores Index
 *
 * Exports all wellness data stores and factory functions.
 */

// Biomarker Store
export {
  type BiomarkerStore,
  DatabaseBiomarkerStore,
  InMemoryBiomarkerStore,
  createBiomarkerStore,
} from './biomarker-store.js';

// Wearable Store
export {
  type WearableStore,
  DatabaseWearableStore,
  InMemoryWearableStore,
  createWearableStore,
} from './wearable-store.js';

// Sleep Store
export {
  type SleepStore,
  DatabaseSleepStore,
  InMemorySleepStore,
  createSleepStore,
} from './sleep-store.js';

// Activity Store
export {
  type ActivityStore,
  DatabaseActivityStore,
  InMemoryActivityStore,
  createActivityStore,
} from './activity-store.js';

// Medication Store
export {
  type MedicationStore,
  DatabaseMedicationStore,
  InMemoryMedicationStore,
  createMedicationStore,
} from './medication-store.js';

// =============================================================================
// Store Collection Type
// =============================================================================

import type { BiomarkerStore } from './biomarker-store.js';
import type { WearableStore } from './wearable-store.js';
import type { SleepStore } from './sleep-store.js';
import type { ActivityStore } from './activity-store.js';
import type { MedicationStore } from './medication-store.js';

export interface WellnessStores {
  biomarker?: BiomarkerStore;
  wearable?: WearableStore;
  sleep?: SleepStore;
  activity?: ActivityStore;
  medication?: MedicationStore;
}

// =============================================================================
// Store Factory
// =============================================================================

import type { DatabaseAdapter } from '../../persistence/index.js';
import { createBiomarkerStore } from './biomarker-store.js';
import { createWearableStore } from './wearable-store.js';
import { createSleepStore } from './sleep-store.js';
import { createActivityStore } from './activity-store.js';
import { createMedicationStore } from './medication-store.js';

/**
 * Create all wellness stores
 */
export function createWellnessStores(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): WellnessStores {
  return {
    biomarker: createBiomarkerStore(type, db),
    wearable: createWearableStore(type, db),
    sleep: createSleepStore(type, db),
    activity: createActivityStore(type, db),
    medication: createMedicationStore(type, db),
  };
}

/**
 * Initialize all stores
 */
export async function initializeWellnessStores(stores: WellnessStores): Promise<void> {
  const initPromises: Promise<void>[] = [];

  if (stores.biomarker) initPromises.push(stores.biomarker.initialize());
  if (stores.wearable) initPromises.push(stores.wearable.initialize());
  if (stores.sleep) initPromises.push(stores.sleep.initialize());
  if (stores.activity) initPromises.push(stores.activity.initialize());
  if (stores.medication) initPromises.push(stores.medication.initialize());

  await Promise.all(initPromises);
}
