/**
 * ARIA Integration - AI Agent Tools
 *
 * Tool definitions for ARIA integration with SecureAgent
 */

import type { ToolDefinition, ToolParameter } from '../types.js';
import { getAriaClient } from './api.js';
import { getAriaBrowser, closeAriaBrowser } from './browser.js';
import type { AriaReportInput, SessionType } from './types.js';

// =============================================================================
// Tool Definitions
// =============================================================================

export function getAriaTools(): ToolDefinition[] {
  return [
    // =========================================================================
    // Authentication Tools
    // =========================================================================
    {
      name: 'aria_connect',
      description: 'Connect to ARIA patient management system with email and password',
      parameters: [
        {
          name: 'email',
          type: 'string',
          description: 'ARIA account email',
          required: true,
        },
        {
          name: 'password',
          type: 'string',
          description: 'ARIA account password',
          required: true,
        },
      ],
      riskLevel: 'medium',
      execute: async (params) => {
        const client = getAriaClient();
        const result = await client.login({
          email: params.email as string,
          password: params.password as string,
        });

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              message: `Connected to ARIA as ${result.data.name}`,
              user: result.data,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_disconnect',
      description: 'Disconnect from ARIA and clear session',
      parameters: [],
      riskLevel: 'low',
      execute: async () => {
        const client = getAriaClient();
        await client.logout();
        await closeAriaBrowser();
        return { success: true, data: { message: 'Disconnected from ARIA' } };
      },
    },

    // =========================================================================
    // Patient Tools
    // =========================================================================
    {
      name: 'aria_search_patients',
      description: 'Search for patients in ARIA by name',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Patient name or search query',
          required: true,
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of results (default: 10)',
          required: false,
          default: 10,
        },
      ],
      riskLevel: 'low',
      execute: async (params) => {
        const client = getAriaClient();
        const result = await client.searchPatients(
          params.query as string,
          { limit: (params.limit as number) || 10 }
        );

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              patients: result.data,
              count: result.data.length,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_get_patient',
      description: 'Get detailed information about a specific patient',
      parameters: [
        {
          name: 'patientId',
          type: 'string',
          description: 'Patient ID',
          required: true,
        },
      ],
      riskLevel: 'low',
      execute: async (params) => {
        const client = getAriaClient();
        const result = await client.getPatient(params.patientId as string);

        if (result.success && result.data) {
          return { success: true, data: { patient: result.data } };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_patient_history',
      description: 'Get session history for a patient',
      parameters: [
        {
          name: 'patientId',
          type: 'string',
          description: 'Patient ID',
          required: true,
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of sessions to return (default: 10)',
          required: false,
          default: 10,
        },
      ],
      riskLevel: 'low',
      execute: async (params) => {
        const client = getAriaClient();
        const result = await client.getPatientHistory(
          params.patientId as string,
          { limit: (params.limit as number) || 10 }
        );

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              sessions: result.data.items,
              total: result.data.total,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    // =========================================================================
    // Report Tools
    // =========================================================================
    {
      name: 'aria_create_report',
      description: 'Create a new clinical report for a patient session',
      parameters: [
        {
          name: 'patientId',
          type: 'string',
          description: 'Patient ID',
          required: true,
        },
        {
          name: 'sessionNotes',
          type: 'string',
          description: 'Notes from the session',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Report type (session_notes, progress_report, assessment, treatment_plan, discharge_summary)',
          required: false,
          default: 'session_notes',
          enum: ['session_notes', 'progress_report', 'assessment', 'treatment_plan', 'discharge_summary'],
        },
        {
          name: 'sessionId',
          type: 'string',
          description: 'Optional session ID to link the report',
          required: false,
        },
      ],
      riskLevel: 'medium',
      execute: async (params) => {
        const client = getAriaClient();

        const input: AriaReportInput = {
          patientId: params.patientId as string,
          sessionNotes: params.sessionNotes as string,
          type: (params.type as AriaReportInput['type']) || 'session_notes',
          sessionId: params.sessionId as string | undefined,
        };

        const result = await client.createReport(input);

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              message: 'Report created successfully',
              report: result.data,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_generate_report',
      description: 'Use AI to generate a clinical report from session notes',
      parameters: [
        {
          name: 'patientId',
          type: 'string',
          description: 'Patient ID',
          required: true,
        },
        {
          name: 'sessionNotes',
          type: 'string',
          description: 'Raw notes from the session',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Report type',
          required: false,
          default: 'session_notes',
          enum: ['session_notes', 'progress_report', 'assessment', 'treatment_plan', 'discharge_summary'],
        },
        {
          name: 'format',
          type: 'string',
          description: 'Report format (clinical, brief, detailed)',
          required: false,
          default: 'clinical',
          enum: ['clinical', 'brief', 'detailed'],
        },
        {
          name: 'includeHistory',
          type: 'boolean',
          description: 'Include patient session history for context',
          required: false,
          default: true,
        },
      ],
      riskLevel: 'medium',
      execute: async (params) => {
        const client = getAriaClient();

        const result = await client.generateReportContent(
          params.patientId as string,
          params.sessionNotes as string,
          {
            type: params.type as AriaReportInput['type'],
            format: params.format as 'clinical' | 'brief' | 'detailed',
            includeHistory: params.includeHistory as boolean ?? true,
          }
        );

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              message: 'Report content generated',
              content: result.data,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_get_report',
      description: 'Get a specific report by ID',
      parameters: [
        {
          name: 'reportId',
          type: 'string',
          description: 'Report ID',
          required: true,
        },
      ],
      riskLevel: 'low',
      execute: async (params) => {
        const client = getAriaClient();
        const result = await client.getReport(params.reportId as string);

        if (result.success && result.data) {
          return { success: true, data: { report: result.data } };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_export_pdf',
      description: 'Export a report as PDF',
      parameters: [
        {
          name: 'reportId',
          type: 'string',
          description: 'Report ID to export',
          required: true,
        },
      ],
      riskLevel: 'low',
      execute: async (params) => {
        const client = getAriaClient();
        const result = await client.exportReportPDF(params.reportId as string);

        if (result.success && result.data) {
          return {
            success: true,
            data: {
              message: 'PDF exported successfully',
              url: result.data.url,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    // =========================================================================
    // Browser Automation Tools
    // =========================================================================
    {
      name: 'aria_browser_login',
      description: 'Login to ARIA web interface via browser automation',
      parameters: [
        {
          name: 'email',
          type: 'string',
          description: 'ARIA account email',
          required: true,
        },
        {
          name: 'password',
          type: 'string',
          description: 'ARIA account password',
          required: true,
        },
      ],
      riskLevel: 'high',
      execute: async (params) => {
        const browser = getAriaBrowser();

        if (!browser.isActive()) {
          await browser.initialize();
        }

        const result = await browser.login(
          params.email as string,
          params.password as string
        );

        if (result.success) {
          return {
            success: true,
            data: { message: 'Logged in to ARIA web interface' },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_browser_navigate_patient',
      description: 'Navigate to a patient page in ARIA browser',
      parameters: [
        {
          name: 'patientName',
          type: 'string',
          description: 'Patient name to search for',
          required: true,
        },
      ],
      riskLevel: 'medium',
      execute: async (params) => {
        const browser = getAriaBrowser();
        const result = await browser.navigateToPatient(params.patientName as string);

        if (result.success && result.patient) {
          return {
            success: true,
            data: {
              message: `Navigated to patient: ${result.patient.name}`,
              patient: result.patient,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_browser_fill_report',
      description: 'Fill a report form in ARIA browser',
      parameters: [
        {
          name: 'notes',
          type: 'string',
          description: 'Session notes content',
          required: true,
        },
        {
          name: 'sessionDate',
          type: 'string',
          description: 'Session date (YYYY-MM-DD)',
          required: false,
        },
        {
          name: 'sessionType',
          type: 'string',
          description: 'Type of session',
          required: false,
          enum: ['initial_assessment', 'follow_up', 'therapy', 'evaluation', 'consultation', 'crisis', 'group', 'family', 'other'],
        },
        {
          name: 'duration',
          type: 'number',
          description: 'Session duration in minutes',
          required: false,
        },
      ],
      riskLevel: 'medium',
      execute: async (params) => {
        const browser = getAriaBrowser();

        // Navigate to new report form
        const navResult = await browser.navigateToNewReport();
        if (!navResult.success) {
          return { success: false, error: navResult.error };
        }

        // Fill the form
        const result = await browser.fillReportForm({
          notes: params.notes as string,
          sessionDate: params.sessionDate as string | undefined,
          sessionType: params.sessionType as SessionType | undefined,
          duration: params.duration as number | undefined,
        });

        if (result.success) {
          return {
            success: true,
            data: { message: 'Report form filled successfully' },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_browser_save',
      description: 'Save the current report in ARIA browser',
      parameters: [],
      riskLevel: 'medium',
      execute: async () => {
        const browser = getAriaBrowser();
        const result = await browser.saveReport();

        if (result.success) {
          return {
            success: true,
            data: {
              message: 'Report saved successfully',
              reportId: result.reportId,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_browser_export_pdf',
      description: 'Export current report as PDF via browser',
      parameters: [],
      riskLevel: 'low',
      execute: async () => {
        const browser = getAriaBrowser();
        const result = await browser.exportPDF();

        if (result.success) {
          return {
            success: true,
            data: {
              message: 'PDF exported successfully',
              path: result.pdfPath,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },

    {
      name: 'aria_browser_screenshot',
      description: 'Take a screenshot of the current ARIA page',
      parameters: [],
      riskLevel: 'low',
      execute: async () => {
        const browser = getAriaBrowser();
        const result = await browser.screenshot();

        if (result.success) {
          return {
            success: true,
            data: {
              message: 'Screenshot taken',
              path: result.path,
            },
          };
        }

        return { success: false, error: result.error };
      },
    },
  ];
}

// =============================================================================
// Tool Conversion for Anthropic API
// =============================================================================

export function getAriaToolsForAnthropic(): {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}[] {
  return getAriaTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters.reduce(
        (acc, param) => ({
          ...acc,
          [param.name]: {
            type: param.type,
            description: param.description,
            ...(param.enum ? { enum: param.enum } : {}),
            ...(param.default !== undefined ? { default: param.default } : {}),
          },
        }),
        {}
      ),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
    },
  }));
}
