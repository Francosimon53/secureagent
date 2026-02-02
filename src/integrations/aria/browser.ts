/**
 * ARIA Integration - Browser Automation
 *
 * Puppeteer-based browser automation for ARIA web interface
 */

import type {
  AriaFormData,
  AriaBrowserSession,
  AriaPatientSummary,
  SessionType,
} from './types.js';
import { AriaConfig, DEFAULT_ARIA_CONFIG, SESSION_TYPE_LABELS } from './config.js';

// =============================================================================
// Browser Automation Class
// =============================================================================

export class AriaBrowserAutomation {
  private config: AriaConfig;
  private session: AriaBrowserSession = {
    isLoggedIn: false,
    lastActivity: 0,
  };
  private browser: unknown = null;
  private page: unknown = null;

  constructor(config: Partial<AriaConfig> = {}) {
    this.config = { ...DEFAULT_ARIA_CONFIG, ...config };
  }

  // ===========================================================================
  // Browser Lifecycle
  // ===========================================================================

  /**
   * Initialize browser instance
   */
  async initialize(): Promise<void> {
    // Dynamic import to avoid bundling issues
    const puppeteer = await import('puppeteer');
    this.browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.page = await (this.browser as { newPage: () => Promise<unknown> }).newPage();
    await this.setViewport(1280, 800);
  }

  /**
   * Set viewport size
   */
  private async setViewport(width: number, height: number): Promise<void> {
    if (!this.page) return;
    await (this.page as { setViewport: (opts: { width: number; height: number }) => Promise<void> })
      .setViewport({ width, height });
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await (this.browser as { close: () => Promise<void> }).close();
      this.browser = null;
      this.page = null;
      this.session.isLoggedIn = false;
    }
  }

  /**
   * Check if browser is active
   */
  isActive(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Get session status
   */
  getSession(): AriaBrowserSession {
    return { ...this.session };
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Login to ARIA web interface
   */
  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      const page = this.page as {
        goto: (url: string, opts?: object) => Promise<void>;
        waitForSelector: (selector: string, opts?: object) => Promise<unknown>;
        type: (selector: string, text: string) => Promise<void>;
        click: (selector: string) => Promise<void>;
        waitForNavigation: (opts?: object) => Promise<void>;
        url: () => string;
        $: (selector: string) => Promise<unknown>;
      };

      // Navigate to login page
      await page.goto(`${this.config.baseUrl}/login`, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout,
      });

      // Wait for login form
      await page.waitForSelector('input[type="email"], input[name="email"]', {
        timeout: 10000,
      });

      // Fill email
      const emailInput = await page.$('input[type="email"], input[name="email"]');
      if (emailInput) {
        await page.type('input[type="email"], input[name="email"]', email);
      }

      // Fill password
      const passwordInput = await page.$('input[type="password"], input[name="password"]');
      if (passwordInput) {
        await page.type('input[type="password"], input[name="password"]', password);
      }

      // Click login button
      await page.click('button[type="submit"], input[type="submit"]');

      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

      // Check if login was successful
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/error')) {
        return { success: false, error: 'Invalid credentials or login failed' };
      }

      this.session.isLoggedIn = true;
      this.session.lastActivity = Date.now();
      this.session.currentPage = currentUrl;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  /**
   * Logout from ARIA
   */
  async logout(): Promise<void> {
    if (!this.page || !this.session.isLoggedIn) return;

    try {
      const page = this.page as {
        goto: (url: string, opts?: object) => Promise<void>;
      };
      await page.goto(`${this.config.baseUrl}/logout`, { waitUntil: 'networkidle2' });
    } catch {
      // Ignore logout errors
    }

    this.session.isLoggedIn = false;
    this.session.currentPage = undefined;
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================

  /**
   * Navigate to patient page
   */
  async navigateToPatient(
    patientNameOrId: string
  ): Promise<{ success: boolean; patient?: AriaPatientSummary; error?: string }> {
    if (!this.page || !this.session.isLoggedIn) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      const page = this.page as {
        goto: (url: string, opts?: object) => Promise<void>;
        waitForSelector: (selector: string, opts?: object) => Promise<unknown>;
        type: (selector: string, text: string) => Promise<void>;
        click: (selector: string) => Promise<void>;
        waitForNavigation: (opts?: object) => Promise<void>;
        $$eval: <T>(selector: string, fn: (els: unknown[]) => T) => Promise<T>;
        $eval: (selector: string, fn: (el: unknown) => unknown) => Promise<unknown>;
        url: () => string;
      };

      // Navigate to patients list
      await page.goto(`${this.config.baseUrl}/patients`, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout,
      });

      // Search for patient
      await page.waitForSelector('input[type="search"], input[placeholder*="buscar"], input[placeholder*="search"]', {
        timeout: 10000,
      });
      await page.type('input[type="search"], input[placeholder*="buscar"], input[placeholder*="search"]', patientNameOrId);

      // Wait for search results
      await new Promise((r) => setTimeout(r, 1500));

      // Click on first result - the callback runs in browser context
      const results = await page.$$eval(
        '.patient-row, .patient-item, [data-patient-id]',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (elements: any[]) => elements.map((el) => ({
          id: el.getAttribute?.('data-patient-id') || '',
          name: el.textContent?.trim() || '',
        }))
      );

      if (results && Array.isArray(results) && results.length > 0) {
        await page.click('.patient-row, .patient-item, [data-patient-id]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        this.session.currentPage = page.url();
        this.session.lastActivity = Date.now();

        const firstResult = results[0] as { id: string; name: string };
        return {
          success: true,
          patient: {
            id: firstResult.id,
            name: firstResult.name,
            totalSessions: 0,
            status: 'active',
          },
        };
      }

      return { success: false, error: 'Patient not found' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Navigation failed',
      };
    }
  }

  /**
   * Navigate to new report form
   */
  async navigateToNewReport(patientId?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.page || !this.session.isLoggedIn) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      const page = this.page as {
        goto: (url: string, opts?: object) => Promise<void>;
        waitForSelector: (selector: string, opts?: object) => Promise<unknown>;
        click: (selector: string) => Promise<void>;
      };

      const url = patientId
        ? `${this.config.baseUrl}/patients/${patientId}/reports/new`
        : `${this.config.baseUrl}/reports/new`;

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.config.timeout });

      // Wait for form to load
      await page.waitForSelector('form, [data-form="report"]', { timeout: 10000 });

      this.session.lastActivity = Date.now();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Navigation failed',
      };
    }
  }

  // ===========================================================================
  // Form Operations
  // ===========================================================================

  /**
   * Fill report form with data
   */
  async fillReportForm(data: AriaFormData): Promise<{ success: boolean; error?: string }> {
    if (!this.page || !this.session.isLoggedIn) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      const page = this.page as {
        waitForSelector: (selector: string, opts?: object) => Promise<unknown>;
        type: (selector: string, text: string) => Promise<void>;
        select: (selector: string, value: string) => Promise<void>;
        click: (selector: string) => Promise<void>;
        $: (selector: string) => Promise<unknown>;
        evaluate: (fn: () => void) => Promise<void>;
      };

      // Fill session date if provided
      if (data.sessionDate) {
        const dateInput = await page.$('input[type="date"], input[name="date"], input[name="sessionDate"]');
        if (dateInput) {
          await page.type('input[type="date"], input[name="date"], input[name="sessionDate"]', data.sessionDate);
        }
      }

      // Select session type if provided
      if (data.sessionType) {
        const typeSelect = await page.$('select[name="type"], select[name="sessionType"]');
        if (typeSelect) {
          await page.select('select[name="type"], select[name="sessionType"]', data.sessionType);
        }
      }

      // Fill duration if provided
      if (data.duration) {
        const durationInput = await page.$('input[name="duration"]');
        if (durationInput) {
          await page.type('input[name="duration"]', String(data.duration));
        }
      }

      // Fill notes/content
      if (data.notes) {
        const notesInput = await page.$('textarea[name="notes"], textarea[name="content"], [contenteditable="true"]');
        if (notesInput) {
          await page.type('textarea[name="notes"], textarea[name="content"]', data.notes);
        }
      }

      // Fill goals
      if (data.goals) {
        const goalsInput = await page.$('textarea[name="goals"]');
        if (goalsInput) {
          await page.type('textarea[name="goals"]', data.goals);
        }
      }

      // Fill observations
      if (data.observations) {
        const obsInput = await page.$('textarea[name="observations"]');
        if (obsInput) {
          await page.type('textarea[name="observations"]', data.observations);
        }
      }

      // Fill next steps
      if (data.nextSteps) {
        const nextInput = await page.$('textarea[name="nextSteps"], textarea[name="plan"]');
        if (nextInput) {
          await page.type('textarea[name="nextSteps"], textarea[name="plan"]', data.nextSteps);
        }
      }

      // Fill custom fields
      if (data.customFields) {
        for (const [fieldName, value] of Object.entries(data.customFields)) {
          const input = await page.$(`input[name="${fieldName}"], textarea[name="${fieldName}"]`);
          if (input) {
            await page.type(`input[name="${fieldName}"], textarea[name="${fieldName}"]`, value);
          }
        }
      }

      this.session.lastActivity = Date.now();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Form fill failed',
      };
    }
  }

  /**
   * Save the current report
   */
  async saveReport(): Promise<{ success: boolean; reportId?: string; error?: string }> {
    if (!this.page || !this.session.isLoggedIn) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      const page = this.page as {
        click: (selector: string) => Promise<void>;
        waitForNavigation: (opts?: object) => Promise<void>;
        waitForSelector: (selector: string, opts?: object) => Promise<unknown>;
        url: () => string;
        $eval: (selector: string, fn: (el: unknown) => unknown) => Promise<unknown>;
      };

      // Click save button
      await page.click('button[type="submit"], button:has-text("Guardar"), button:has-text("Save")');

      // Wait for save to complete
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

      // Check for success
      const currentUrl = page.url();
      if (currentUrl.includes('/reports/')) {
        const reportId = currentUrl.split('/reports/')[1]?.split('/')[0] || '';
        this.session.lastActivity = Date.now();
        return { success: true, reportId };
      }

      // Check for error message
      const errorMessage = await page.$eval('.error, .alert-error', (el) => (el as { textContent?: string }).textContent).catch(() => null);
      if (errorMessage) {
        return { success: false, error: errorMessage as string };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Save failed',
      };
    }
  }

  /**
   * Export current report as PDF
   */
  async exportPDF(): Promise<{ success: boolean; pdfPath?: string; error?: string }> {
    if (!this.page || !this.session.isLoggedIn) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      const page = this.page as {
        click: (selector: string) => Promise<void>;
        waitForSelector: (selector: string, opts?: object) => Promise<unknown>;
        pdf: (opts: { path: string; format: string }) => Promise<void>;
      };

      // Try to click export button first
      try {
        await page.click('button:has-text("Exportar"), button:has-text("Export"), [data-action="export-pdf"]');
        await page.waitForSelector('.download-ready, [data-download]', { timeout: 10000 });
      } catch {
        // If no export button, generate PDF directly
        const pdfPath = `/tmp/aria-report-${Date.now()}.pdf`;
        await page.pdf({ path: pdfPath, format: 'Letter' });
        return { success: true, pdfPath };
      }

      this.session.lastActivity = Date.now();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  // ===========================================================================
  // Screenshot
  // ===========================================================================

  /**
   * Take a screenshot of the current page
   */
  async screenshot(path?: string): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      const page = this.page as {
        screenshot: (opts: { path: string; fullPage: boolean }) => Promise<void>;
      };
      const screenshotPath = path || `/tmp/aria-screenshot-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return { success: true, path: screenshotPath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot failed',
      };
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let browserInstance: AriaBrowserAutomation | null = null;

export function getAriaBrowser(config?: Partial<AriaConfig>): AriaBrowserAutomation {
  if (!browserInstance || config) {
    browserInstance = new AriaBrowserAutomation(config);
  }
  return browserInstance;
}

export async function closeAriaBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
