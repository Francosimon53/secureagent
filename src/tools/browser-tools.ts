/**
 * Browser Automation Tools
 *
 * Tools for web browser automation using Playwright.
 * Enables agents to navigate websites, take screenshots, click elements,
 * fill forms, and extract content.
 *
 * SECURITY: All browser tools are HIGH RISK and require approval.
 */

import { z } from 'zod';
import type { Browser, Page, BrowserContext } from 'playwright-core';

// =============================================================================
// Types
// =============================================================================

export interface BrowserToolConfig {
  /** Maximum page load timeout in ms */
  pageLoadTimeout: number;
  /** Maximum action timeout in ms */
  actionTimeout: number;
  /** Default viewport width */
  viewportWidth: number;
  /** Default viewport height */
  viewportHeight: number;
  /** User agent string */
  userAgent?: string;
  /** Block certain resource types */
  blockedResources?: ('image' | 'stylesheet' | 'font' | 'media')[];
  /** Maximum concurrent pages */
  maxConcurrentPages: number;
}

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  pages: Map<string, Page>;
  createdAt: number;
}

export interface NavigateResult {
  success: boolean;
  url: string;
  title: string;
  status?: number;
  error?: string;
}

export interface ScreenshotResult {
  success: boolean;
  data: string; // Base64 encoded
  format: 'png' | 'jpeg';
  width: number;
  height: number;
  error?: string;
}

export interface ClickResult {
  success: boolean;
  selector: string;
  clicked: boolean;
  error?: string;
}

export interface TypeResult {
  success: boolean;
  selector: string;
  typed: boolean;
  error?: string;
}

export interface ExtractResult {
  success: boolean;
  selector?: string;
  content: string;
  error?: string;
}

export interface ElementInfo {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  visible: boolean;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface QueryResult {
  success: boolean;
  count: number;
  elements: ElementInfo[];
  error?: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: BrowserToolConfig = {
  pageLoadTimeout: 30000,
  actionTimeout: 10000,
  viewportWidth: 1280,
  viewportHeight: 720,
  maxConcurrentPages: 5,
  blockedResources: [],
};

// =============================================================================
// Browser Manager
// =============================================================================

/**
 * Manages browser sessions for tool execution
 */
export class BrowserManager {
  private config: BrowserToolConfig;
  private sessions = new Map<string, BrowserSession>();
  private browserModule: typeof import('playwright-core') | null = null;

  constructor(config?: Partial<BrowserToolConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Lazy-load Playwright to avoid issues when not needed
   */
  private async getPlaywright(): Promise<typeof import('playwright-core')> {
    if (!this.browserModule) {
      this.browserModule = await import('playwright-core');
    }
    return this.browserModule;
  }

  /**
   * Create a new browser session
   */
  async createSession(sessionId?: string): Promise<string> {
    const playwright = await this.getPlaywright();
    const id = sessionId || `browser_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Try to connect to an existing browser or launch one
    let browser: Browser;
    try {
      // Try connecting to a browser server (for serverless/remote)
      const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
      if (wsEndpoint) {
        browser = await playwright.chromium.connect(wsEndpoint);
      } else {
        // Launch locally
        browser = await playwright.chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }
    } catch (error) {
      throw new Error(`Failed to launch browser: ${(error as Error).message}`);
    }

    // Create context with settings
    const context = await browser.newContext({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      userAgent: this.config.userAgent,
    });

    // Block resources if configured
    if (this.config.blockedResources && this.config.blockedResources.length > 0) {
      await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (this.config.blockedResources!.includes(resourceType as any)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    const session: BrowserSession = {
      id,
      browser,
      context,
      pages: new Map(),
      createdAt: Date.now(),
    };

    this.sessions.set(id, session);
    return id;
  }

  /**
   * Get or create a page in a session
   */
  async getPage(sessionId: string, pageId?: string): Promise<Page> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }

    const id = pageId || 'default';
    let page = session.pages.get(id);

    if (!page) {
      if (session.pages.size >= this.config.maxConcurrentPages) {
        throw new Error(`Maximum concurrent pages (${this.config.maxConcurrentPages}) reached`);
      }
      page = await session.context.newPage();
      page.setDefaultTimeout(this.config.actionTimeout);
      page.setDefaultNavigationTimeout(this.config.pageLoadTimeout);
      session.pages.set(id, page);
    }

    return page;
  }

  /**
   * Close a browser session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.context.close();
      await session.browser.close();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): { id: string; pages: number; createdAt: number } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      pages: session.pages.size,
      createdAt: session.createdAt,
    };
  }
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const BrowserNavigateSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  url: z.string().url().describe('URL to navigate to'),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional()
    .describe('When to consider navigation complete'),
});

export const BrowserScreenshotSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  fullPage: z.boolean().optional().describe('Capture full scrollable page'),
  selector: z.string().optional().describe('CSS selector to screenshot specific element'),
  format: z.enum(['png', 'jpeg']).optional().describe('Image format'),
  quality: z.number().min(0).max(100).optional().describe('JPEG quality (0-100)'),
});

export const BrowserClickSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector of element to click'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
  clickCount: z.number().min(1).max(3).optional().describe('Number of clicks'),
  timeout: z.number().optional().describe('Timeout in ms to wait for element'),
});

export const BrowserTypeSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector of input element'),
  text: z.string().describe('Text to type'),
  delay: z.number().optional().describe('Delay between keystrokes in ms'),
  clear: z.boolean().optional().describe('Clear existing text before typing'),
});

export const BrowserExtractSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().optional().describe('CSS selector to extract from (default: body)'),
  type: z.enum(['text', 'html', 'innerText', 'value']).optional()
    .describe('What to extract'),
});

export const BrowserQuerySchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector to query'),
  limit: z.number().optional().describe('Maximum elements to return'),
});

export const BrowserEvalSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  script: z.string().describe('JavaScript to evaluate in page context'),
});

export const BrowserWaitSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().optional().describe('Wait for element matching selector'),
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional()
    .describe('Element state to wait for'),
  timeout: z.number().optional().describe('Timeout in ms'),
});

// =============================================================================
// Browser Tools Class
// =============================================================================

export class BrowserTools {
  private manager: BrowserManager;

  constructor(config?: Partial<BrowserToolConfig>) {
    this.manager = new BrowserManager(config);
  }

  /**
   * Create a new browser session
   */
  async createSession(): Promise<{ sessionId: string }> {
    const sessionId = await this.manager.createSession();
    return { sessionId };
  }

  /**
   * Close a browser session
   */
  async closeSession(sessionId: string): Promise<{ success: boolean }> {
    await this.manager.closeSession(sessionId);
    return { success: true };
  }

  /**
   * Navigate to a URL
   */
  async navigate(params: z.infer<typeof BrowserNavigateSchema>): Promise<NavigateResult> {
    try {
      const page = await this.manager.getPage(params.sessionId);
      const response = await page.goto(params.url, {
        waitUntil: params.waitUntil || 'load',
      });

      return {
        success: true,
        url: page.url(),
        title: await page.title(),
        status: response?.status(),
      };
    } catch (error) {
      return {
        success: false,
        url: params.url,
        title: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(params: z.infer<typeof BrowserScreenshotSchema>): Promise<ScreenshotResult> {
    try {
      const page = await this.manager.getPage(params.sessionId);
      const format = params.format || 'png';

      let buffer: Buffer;
      if (params.selector) {
        const element = await page.$(params.selector);
        if (!element) {
          return {
            success: false,
            data: '',
            format,
            width: 0,
            height: 0,
            error: `Element not found: ${params.selector}`,
          };
        }
        buffer = await element.screenshot({
          type: format,
          quality: format === 'jpeg' ? params.quality : undefined,
        });
      } else {
        buffer = await page.screenshot({
          fullPage: params.fullPage,
          type: format,
          quality: format === 'jpeg' ? params.quality : undefined,
        });
      }

      const viewport = page.viewportSize();
      return {
        success: true,
        data: buffer.toString('base64'),
        format,
        width: viewport?.width || 0,
        height: viewport?.height || 0,
      };
    } catch (error) {
      return {
        success: false,
        data: '',
        format: params.format || 'png',
        width: 0,
        height: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Click an element
   */
  async click(params: z.infer<typeof BrowserClickSchema>): Promise<ClickResult> {
    try {
      const page = await this.manager.getPage(params.sessionId);
      await page.click(params.selector, {
        button: params.button,
        clickCount: params.clickCount,
        timeout: params.timeout,
      });

      return {
        success: true,
        selector: params.selector,
        clicked: true,
      };
    } catch (error) {
      return {
        success: false,
        selector: params.selector,
        clicked: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Type text into an element
   */
  async type(params: z.infer<typeof BrowserTypeSchema>): Promise<TypeResult> {
    try {
      const page = await this.manager.getPage(params.sessionId);

      if (params.clear) {
        await page.fill(params.selector, '');
      }

      await page.type(params.selector, params.text, {
        delay: params.delay,
      });

      return {
        success: true,
        selector: params.selector,
        typed: true,
      };
    } catch (error) {
      return {
        success: false,
        selector: params.selector,
        typed: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract content from page
   */
  async extract(params: z.infer<typeof BrowserExtractSchema>): Promise<ExtractResult> {
    try {
      const page = await this.manager.getPage(params.sessionId);
      const selector = params.selector || 'body';
      const type = params.type || 'text';

      const element = await page.$(selector);
      if (!element) {
        return {
          success: false,
          selector,
          content: '',
          error: `Element not found: ${selector}`,
        };
      }

      let content: string;
      switch (type) {
        case 'html':
          content = await element.innerHTML();
          break;
        case 'innerText':
          content = await element.innerText();
          break;
        case 'value':
          content = await element.inputValue();
          break;
        case 'text':
        default:
          content = await element.textContent() || '';
          break;
      }

      return {
        success: true,
        selector,
        content,
      };
    } catch (error) {
      return {
        success: false,
        selector: params.selector,
        content: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Query elements on page
   */
  async query(params: z.infer<typeof BrowserQuerySchema>): Promise<QueryResult> {
    try {
      const page = await this.manager.getPage(params.sessionId);
      const elements = await page.$$(params.selector);
      const limit = params.limit || 10;

      const results: ElementInfo[] = [];
      for (let i = 0; i < Math.min(elements.length, limit); i++) {
        const el = elements[i];
        const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
        const text = await el.textContent() || '';
        const visible = await el.isVisible();
        const box = await el.boundingBox();

        // Get attributes
        const attributes = await el.evaluate((e) => {
          const attrs: Record<string, string> = {};
          for (const attr of e.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        });

        results.push({
          tag: tagName,
          text: text.slice(0, 200), // Truncate long text
          attributes,
          visible,
          rect: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined,
        });
      }

      return {
        success: true,
        count: elements.length,
        elements: results,
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        elements: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Evaluate JavaScript in page context
   */
  async evaluate(params: z.infer<typeof BrowserEvalSchema>): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const page = await this.manager.getPage(params.sessionId);
      const result = await page.evaluate(params.script);

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Wait for element or condition
   */
  async wait(params: z.infer<typeof BrowserWaitSchema>): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.manager.getPage(params.sessionId);

      if (params.selector) {
        await page.waitForSelector(params.selector, {
          state: params.state,
          timeout: params.timeout,
        });
      } else {
        // Just wait for timeout
        await page.waitForTimeout(params.timeout || 1000);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get the browser manager (for advanced use)
   */
  getManager(): BrowserManager {
    return this.manager;
  }
}

// =============================================================================
// Factory
// =============================================================================

let browserToolsInstance: BrowserTools | null = null;

export function getBrowserTools(config?: Partial<BrowserToolConfig>): BrowserTools {
  if (!browserToolsInstance) {
    browserToolsInstance = new BrowserTools(config);
  }
  return browserToolsInstance;
}

export function createBrowserTools(config?: Partial<BrowserToolConfig>): BrowserTools {
  return new BrowserTools(config);
}
