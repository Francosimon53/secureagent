/**
 * Health ABA Stores Index
 *
 * Exports all store interfaces, implementations, and factory functions
 */

// Patient Store
export {
  type PatientStore,
  DatabasePatientStore,
  InMemoryPatientStore,
  createPatientStore,
} from './patient-store.js';

// Appointment Store
export {
  type AppointmentStore,
  DatabaseAppointmentStore,
  InMemoryAppointmentStore,
  createAppointmentStore,
} from './appointment-store.js';

// Authorization Store
export {
  type AuthorizationStore,
  DatabaseAuthorizationStore,
  InMemoryAuthorizationStore,
  createAuthorizationStore,
} from './authorization-store.js';

// Audit Store
export {
  type HealthAuditStore,
  type HealthAuditQueryResult,
  type HealthAuditStats,
  DatabaseHealthAuditStore,
  InMemoryHealthAuditStore,
  createHealthAuditStore,
} from './audit-store.js';

// Progress Report Store (to be implemented)
export {
  type ProgressReportStore,
  DatabaseProgressReportStore,
  InMemoryProgressReportStore,
  createProgressReportStore,
} from './progress-report-store.js';

// FAQ Store (to be implemented)
export {
  type FAQStore,
  DatabaseFAQStore,
  InMemoryFAQStore,
  createFAQStore,
} from './faq-store.js';

// Schedule Store (to be implemented)
export {
  type ScheduleStore,
  DatabaseScheduleStore,
  InMemoryScheduleStore,
  createScheduleStore,
} from './schedule-store.js';
