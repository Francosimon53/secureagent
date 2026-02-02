/**
 * ARIA Integration - Types
 *
 * Type definitions for ARIA patient management system integration
 */

// =============================================================================
// Patient Types
// =============================================================================

export interface AriaPatient {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'archived';
  notes?: string;
  tags?: string[];
}

export interface AriaPatientSummary {
  id: string;
  name: string;
  lastSessionDate?: string;
  totalSessions: number;
  status: 'active' | 'inactive' | 'archived';
}

// =============================================================================
// Session Types
// =============================================================================

export interface AriaSession {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  duration: number; // minutes
  type: SessionType;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  goals?: string[];
  techniques?: string[];
  observations?: string;
  nextSteps?: string;
  createdAt: string;
  updatedAt: string;
}

export type SessionType =
  | 'initial_assessment'
  | 'follow_up'
  | 'therapy'
  | 'evaluation'
  | 'consultation'
  | 'crisis'
  | 'group'
  | 'family'
  | 'other';

export interface AriaSessionSummary {
  id: string;
  date: string;
  type: SessionType;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  duration: number;
}

// =============================================================================
// Report Types
// =============================================================================

export interface AriaReport {
  id: string;
  patientId: string;
  patientName: string;
  sessionId?: string;
  type: ReportType;
  title: string;
  content: string;
  status: 'draft' | 'final' | 'signed';
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
  signedBy?: string;
  metadata?: Record<string, unknown>;
}

export type ReportType =
  | 'session_notes'
  | 'progress_report'
  | 'assessment'
  | 'treatment_plan'
  | 'discharge_summary'
  | 'referral'
  | 'custom';

export interface AriaReportInput {
  patientId: string;
  sessionId?: string;
  type: ReportType;
  title?: string;
  sessionNotes: string;
  includeHistory?: boolean;
  includeGoals?: boolean;
  format?: 'clinical' | 'brief' | 'detailed';
}

export interface AriaReportContent {
  title: string;
  sections: AriaReportSection[];
  summary: string;
  recommendations?: string[];
}

export interface AriaReportSection {
  heading: string;
  content: string;
}

// =============================================================================
// Authentication Types
// =============================================================================

export interface AriaCredentials {
  email: string;
  password: string;
}

export interface AriaAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string;
  organizationId?: string;
}

export interface AriaUserInfo {
  id: string;
  email: string;
  name: string;
  role: 'therapist' | 'supervisor' | 'admin';
  organizationId?: string;
  organizationName?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface AriaApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AriaPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =============================================================================
// Browser Automation Types
// =============================================================================

export interface AriaBrowserSession {
  isLoggedIn: boolean;
  currentPage?: string;
  lastActivity: number;
  cookies?: string;
}

export interface AriaFormData {
  patientName?: string;
  sessionDate?: string;
  sessionType?: SessionType;
  duration?: number;
  notes?: string;
  goals?: string;
  techniques?: string;
  observations?: string;
  nextSteps?: string;
  customFields?: Record<string, string>;
}

// =============================================================================
// Event Types
// =============================================================================

export const ARIA_EVENTS = {
  LOGGED_IN: 'aria:logged_in',
  LOGGED_OUT: 'aria:logged_out',
  PATIENT_LOADED: 'aria:patient_loaded',
  REPORT_CREATED: 'aria:report_created',
  REPORT_SAVED: 'aria:report_saved',
  ERROR: 'aria:error',
} as const;

export type AriaEventType = (typeof ARIA_EVENTS)[keyof typeof ARIA_EVENTS];
