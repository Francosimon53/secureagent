/**
 * ARIA Integration - API Client
 *
 * REST API client for ARIA patient management system
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AriaPatient,
  AriaPatientSummary,
  AriaSession,
  AriaSessionSummary,
  AriaReport,
  AriaReportInput,
  AriaReportContent,
  AriaCredentials,
  AriaAuthToken,
  AriaUserInfo,
  AriaApiResponse,
  AriaPaginatedResponse,
} from './types.js';
import { AriaConfig, DEFAULT_ARIA_CONFIG, REPORT_TEMPLATES } from './config.js';

// =============================================================================
// ARIA API Client
// =============================================================================

export class AriaApiClient {
  private config: AriaConfig;
  private authToken: AriaAuthToken | null = null;
  private userInfo: AriaUserInfo | null = null;

  constructor(config: Partial<AriaConfig> = {}) {
    this.config = { ...DEFAULT_ARIA_CONFIG, ...config };
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Login to ARIA with email and password
   */
  async login(credentials: AriaCredentials): Promise<AriaApiResponse<AriaUserInfo>> {
    try {
      const response = await this.request<{ token: AriaAuthToken; user: AriaUserInfo }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(credentials),
        },
        false // Don't require auth for login
      );

      if (response.success && response.data) {
        this.authToken = response.data.token;
        this.userInfo = response.data.user;
        return { success: true, data: response.data.user };
      }

      return { success: false, error: response.error || 'Login failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  /**
   * Logout and clear tokens
   */
  async logout(): Promise<void> {
    if (this.authToken) {
      try {
        await this.request('/auth/logout', { method: 'POST' });
      } catch {
        // Ignore logout errors
      }
    }
    this.authToken = null;
    this.userInfo = null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    if (!this.authToken) return false;
    return this.authToken.expiresAt > Date.now();
  }

  /**
   * Get current user info
   */
  getCurrentUser(): AriaUserInfo | null {
    return this.userInfo;
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<boolean> {
    if (!this.authToken?.refreshToken) return false;

    try {
      const response = await this.request<{ token: AriaAuthToken }>(
        '/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.authToken.refreshToken }),
        },
        false
      );

      if (response.success && response.data) {
        this.authToken = response.data.token;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Patient Operations
  // ===========================================================================

  /**
   * Search for patients by name
   */
  async searchPatients(
    query: string,
    options: { limit?: number; status?: 'active' | 'inactive' | 'archived' } = {}
  ): Promise<AriaApiResponse<AriaPatientSummary[]>> {
    const params = new URLSearchParams({
      q: query,
      limit: String(options.limit || 20),
    });
    if (options.status) {
      params.set('status', options.status);
    }

    return this.request<AriaPatientSummary[]>(`/patients/search?${params}`);
  }

  /**
   * Get patient by ID
   */
  async getPatient(patientId: string): Promise<AriaApiResponse<AriaPatient>> {
    return this.request<AriaPatient>(`/patients/${patientId}`);
  }

  /**
   * Get patient session history
   */
  async getPatientHistory(
    patientId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<AriaApiResponse<AriaPaginatedResponse<AriaSessionSummary>>> {
    const params = new URLSearchParams({
      limit: String(options.limit || 20),
      offset: String(options.offset || 0),
    });

    return this.request<AriaPaginatedResponse<AriaSessionSummary>>(
      `/patients/${patientId}/sessions?${params}`
    );
  }

  /**
   * Get patient reports
   */
  async getPatientReports(
    patientId: string,
    options: { limit?: number; type?: string } = {}
  ): Promise<AriaApiResponse<AriaReport[]>> {
    const params = new URLSearchParams({
      limit: String(options.limit || 20),
    });
    if (options.type) {
      params.set('type', options.type);
    }

    return this.request<AriaReport[]>(`/patients/${patientId}/reports?${params}`);
  }

  // ===========================================================================
  // Session Operations
  // ===========================================================================

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AriaApiResponse<AriaSession>> {
    return this.request<AriaSession>(`/sessions/${sessionId}`);
  }

  /**
   * Create a new session
   */
  async createSession(
    patientId: string,
    data: Partial<AriaSession>
  ): Promise<AriaApiResponse<AriaSession>> {
    return this.request<AriaSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ patientId, ...data }),
    });
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string,
    data: Partial<AriaSession>
  ): Promise<AriaApiResponse<AriaSession>> {
    return this.request<AriaSession>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ===========================================================================
  // Report Operations
  // ===========================================================================

  /**
   * Create a report
   */
  async createReport(input: AriaReportInput): Promise<AriaApiResponse<AriaReport>> {
    return this.request<AriaReport>('/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string): Promise<AriaApiResponse<AriaReport>> {
    return this.request<AriaReport>(`/reports/${reportId}`);
  }

  /**
   * Update report
   */
  async updateReport(
    reportId: string,
    data: Partial<AriaReport>
  ): Promise<AriaApiResponse<AriaReport>> {
    return this.request<AriaReport>(`/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Sign/finalize a report
   */
  async signReport(reportId: string): Promise<AriaApiResponse<AriaReport>> {
    return this.request<AriaReport>(`/reports/${reportId}/sign`, {
      method: 'POST',
    });
  }

  /**
   * Export report as PDF
   */
  async exportReportPDF(reportId: string): Promise<AriaApiResponse<{ url: string }>> {
    return this.request<{ url: string }>(`/reports/${reportId}/export/pdf`);
  }

  // ===========================================================================
  // AI-Powered Report Generation
  // ===========================================================================

  /**
   * Generate report content using AI
   */
  async generateReportContent(
    patientId: string,
    sessionNotes: string,
    options: {
      type?: AriaReportInput['type'];
      format?: 'clinical' | 'brief' | 'detailed';
      includeHistory?: boolean;
    } = {}
  ): Promise<AriaApiResponse<AriaReportContent>> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'AI service not configured' };
    }

    // Get patient info for context
    const patientResult = await this.getPatient(patientId);
    if (!patientResult.success || !patientResult.data) {
      return { success: false, error: 'Patient not found' };
    }

    const patient = patientResult.data;

    // Get recent session history if requested
    let historyContext = '';
    if (options.includeHistory) {
      const historyResult = await this.getPatientHistory(patientId, { limit: 5 });
      if (historyResult.success && historyResult.data) {
        historyContext = `\n\nHistorial reciente (últimas ${historyResult.data.items.length} sesiones):\n${
          historyResult.data.items
            .map((s) => `- ${s.date}: ${s.type} (${s.duration} min)`)
            .join('\n')
        }`;
      }
    }

    const reportType = options.type || 'session_notes';
    const format = options.format || this.config.defaultReportFormat;
    const lang = this.config.language;
    const template = REPORT_TEMPLATES[reportType as keyof typeof REPORT_TEMPLATES]?.[lang];

    const client = new Anthropic({ apiKey });

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: `Eres un asistente clínico especializado en documentación terapéutica. Genera reportes profesionales, éticos y bien estructurados para profesionales de salud mental.

Idioma: ${lang === 'es' ? 'Español' : 'English'}
Formato: ${format === 'brief' ? 'Breve y conciso' : format === 'detailed' ? 'Detallado y exhaustivo' : 'Clínico estándar'}

Instrucciones:
- Mantén un tono profesional y objetivo
- Usa terminología clínica apropiada
- Protege la confidencialidad del paciente
- Incluye solo información relevante clínicamente
- Sigue el formato de secciones proporcionado`,
        messages: [
          {
            role: 'user',
            content: `Genera un reporte de tipo "${template?.title || reportType}" para el siguiente paciente:

Paciente: ${patient.name}
Fecha: ${new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US')}
${historyContext}

Notas de la sesión:
${sessionNotes}

Secciones requeridas:
${template?.sections.map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Genera las secciones apropiadas'}

Responde en formato JSON con esta estructura:
{
  "title": "Título del reporte",
  "sections": [
    { "heading": "Nombre de sección", "content": "Contenido..." }
  ],
  "summary": "Resumen ejecutivo breve",
  "recommendations": ["Recomendación 1", "Recomendación 2"]
}`,
          },
        ],
      });

      // Extract text content
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return { success: false, error: 'No response from AI' };
      }

      // Parse JSON response
      try {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return { success: false, error: 'Invalid AI response format' };
        }
        const reportContent = JSON.parse(jsonMatch[0]) as AriaReportContent;
        return { success: true, data: reportContent };
      } catch {
        return { success: false, error: 'Failed to parse AI response' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI generation failed',
      };
    }
  }

  // ===========================================================================
  // Internal Request Helper
  // ===========================================================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth = true
  ): Promise<AriaApiResponse<T>> {
    if (requireAuth && !this.isAuthenticated()) {
      // Try to refresh token
      if (this.authToken?.refreshToken) {
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          return { success: false, error: 'Authentication required' };
        }
      } else {
        return { success: false, error: 'Authentication required' };
      }
    }

    const url = `${this.config.apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken.accessToken}`;
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.error || errorJson.message || errorMessage;
          } catch {
            // Ignore parse error
          }
          return { success: false, error: errorMessage };
        }

        const data = (await response.json()) as T;
        return { success: true, data };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Request failed');
        if (attempt < this.config.retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    return { success: false, error: lastError?.message || 'Request failed' };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let ariaClient: AriaApiClient | null = null;

export function getAriaClient(config?: Partial<AriaConfig>): AriaApiClient {
  if (!ariaClient || config) {
    ariaClient = new AriaApiClient(config);
  }
  return ariaClient;
}

export function resetAriaClient(): void {
  ariaClient = null;
}
