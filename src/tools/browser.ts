/**
 * Browser Automation Tools with Puppeteer
 *
 * Real browser automation for serverless environments using puppeteer-core
 * and @sparticuz/chromium for Vercel/AWS Lambda compatibility.
 */

import type { Browser, Page } from 'puppeteer-core';

// =============================================================================
// Types
// =============================================================================

export interface BrowserConfig {
  /** Headless mode (default: true) */
  headless?: boolean;
  /** Default viewport width */
  viewportWidth?: number;
  /** Default viewport height */
  viewportHeight?: number;
  /** Navigation timeout in ms */
  navigationTimeout?: number;
  /** Action timeout in ms */
  actionTimeout?: number;
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
  format: 'png' | 'jpeg' | 'webp';
  error?: string;
}

export interface ClickResult {
  success: boolean;
  selector: string;
  error?: string;
}

export interface TypeResult {
  success: boolean;
  selector: string;
  error?: string;
}

export interface ExtractResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface FormFillResult {
  success: boolean;
  filledFields: string[];
  errors: string[];
}

export interface ElementInfo {
  tag: string;
  text: string;
  href?: string;
  src?: string;
  value?: string;
  attributes: Record<string, string>;
}

export interface QueryResult {
  success: boolean;
  count: number;
  elements: ElementInfo[];
  error?: string;
}

// =============================================================================
// Browser Manager
// =============================================================================

const DEFAULT_CONFIG: Required<BrowserConfig> = {
  headless: true,
  viewportWidth: 1280,
  viewportHeight: 720,
  navigationTimeout: 30000,
  actionTimeout: 10000,
};

/**
 * Browser session manager for Puppeteer
 */
export class PuppeteerBrowser {
  private config: Required<BrowserConfig>;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config?: BrowserConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Launch browser (works in serverless environments)
   */
  async launch(): Promise<void> {
    if (this.browser) return;

    const puppeteer = await import('puppeteer-core');

    // Check if running in serverless (Vercel/Lambda)
    const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;

    let executablePath: string;
    let args: string[] = [];

    if (isServerless) {
      // Use @sparticuz/chromium for serverless
      const chromium = await import('@sparticuz/chromium');
      executablePath = await chromium.default.executablePath();
      args = chromium.default.args;
    } else {
      // Local development - try common paths
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];

      const fs = await import('fs');
      executablePath = possiblePaths.find(p => fs.existsSync(p)) || '';

      if (!executablePath) {
        throw new Error(
          'Chrome not found. Install Chrome or set PUPPETEER_EXECUTABLE_PATH environment variable.'
        );
      }

      args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ];
    }

    this.browser = await puppeteer.default.launch({
      executablePath,
      headless: this.config.headless,
      args,
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
    });

    this.page.setDefaultNavigationTimeout(this.config.navigationTimeout);
    this.page.setDefaultTimeout(this.config.actionTimeout);
  }

  /**
   * Ensure browser is launched
   */
  private async ensureBrowser(): Promise<Page> {
    if (!this.browser || !this.page) {
      await this.launch();
    }
    return this.page!;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' = 'load'): Promise<NavigateResult> {
    try {
      const page = await this.ensureBrowser();
      const response = await page.goto(url, { waitUntil });

      return {
        success: true,
        url: page.url(),
        title: await page.title(),
        status: response?.status(),
      };
    } catch (error) {
      return {
        success: false,
        url,
        title: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(options?: {
    fullPage?: boolean;
    selector?: string;
    format?: 'png' | 'jpeg' | 'webp';
    quality?: number;
  }): Promise<ScreenshotResult> {
    try {
      const page = await this.ensureBrowser();
      const format = options?.format || 'png';

      let buffer: Buffer;

      if (options?.selector) {
        const element = await page.$(options.selector);
        if (!element) {
          return {
            success: false,
            data: '',
            format,
            error: `Element not found: ${options.selector}`,
          };
        }
        buffer = await element.screenshot({
          type: format,
          quality: format !== 'png' ? options?.quality : undefined,
        }) as Buffer;
      } else {
        buffer = await page.screenshot({
          fullPage: options?.fullPage,
          type: format,
          quality: format !== 'png' ? options?.quality : undefined,
        }) as Buffer;
      }

      return {
        success: true,
        data: buffer.toString('base64'),
        format,
      };
    } catch (error) {
      return {
        success: false,
        data: '',
        format: options?.format || 'png',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Click an element
   */
  async click(selector: string, options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }): Promise<ClickResult> {
    try {
      const page = await this.ensureBrowser();
      await page.click(selector, {
        button: options?.button,
        clickCount: options?.clickCount,
      });

      return {
        success: true,
        selector,
      };
    } catch (error) {
      return {
        success: false,
        selector,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, options?: { delay?: number; clear?: boolean }): Promise<TypeResult> {
    try {
      const page = await this.ensureBrowser();

      if (options?.clear) {
        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
      }

      await page.type(selector, text, { delay: options?.delay });

      return {
        success: true,
        selector,
      };
    } catch (error) {
      return {
        success: false,
        selector,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract text content from page or element
   */
  async extractText(selector?: string): Promise<ExtractResult> {
    try {
      const page = await this.ensureBrowser();

      let content: string;
      if (selector) {
        const element = await page.$(selector);
        if (!element) {
          return {
            success: false,
            content: '',
            error: `Element not found: ${selector}`,
          };
        }
        content = await page.evaluate(el => el.textContent || '', element);
      } else {
        content = await page.evaluate('document.body.innerText') as string;
      }

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract HTML from page or element
   */
  async extractHtml(selector?: string): Promise<ExtractResult> {
    try {
      const page = await this.ensureBrowser();

      let content: string;
      if (selector) {
        const element = await page.$(selector);
        if (!element) {
          return {
            success: false,
            content: '',
            error: `Element not found: ${selector}`,
          };
        }
        content = await page.evaluate(el => el.innerHTML, element);
      } else {
        content = await page.content();
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Fill a form with multiple fields
   */
  async fillForm(fields: Record<string, string>): Promise<FormFillResult> {
    const filledFields: string[] = [];
    const errors: string[] = [];

    const page = await this.ensureBrowser();

    for (const [selector, value] of Object.entries(fields)) {
      try {
        // Check if it's a select element
        const tagName = await page.$eval(selector, el => el.tagName.toLowerCase()).catch(() => null);

        if (tagName === 'select') {
          await page.select(selector, value);
        } else {
          // Clear and type for input/textarea
          await page.click(selector, { clickCount: 3 });
          await page.keyboard.press('Backspace');
          await page.type(selector, value);
        }

        filledFields.push(selector);
      } catch (error) {
        errors.push(`${selector}: ${(error as Error).message}`);
      }
    }

    return {
      success: errors.length === 0,
      filledFields,
      errors,
    };
  }

  /**
   * Query elements on the page
   */
  async query(selector: string, limit = 10): Promise<QueryResult> {
    try {
      const page = await this.ensureBrowser();

      const elements = await page.$$eval(
        selector,
        (els, max) => {
          return els.slice(0, max).map(el => {
            const attrs: Record<string, string> = {};
            for (const attr of el.attributes) {
              attrs[attr.name] = attr.value;
            }

            return {
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 200),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href: (el as any).href || undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              src: (el as any).src || undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value: (el as any).value || undefined,
              attributes: attrs,
            };
          });
        },
        limit
      );

      return {
        success: true,
        count: elements.length,
        elements,
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
   * Wait for an element or timeout
   */
  async waitFor(selector: string, timeout?: number): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.ensureBrowser();
      await page.waitForSelector(selector, { timeout: timeout || this.config.actionTimeout });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Execute JavaScript in page context
   */
  async evaluate<T>(script: string): Promise<{ success: boolean; result?: T; error?: string }> {
    try {
      const page = await this.ensureBrowser();
      const result = await page.evaluate(script);
      return {
        success: true,
        result: result as T,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get current page URL
   */
  async currentUrl(): Promise<string> {
    const page = await this.ensureBrowser();
    return page.url();
  }

  /**
   * Get page title
   */
  async title(): Promise<string> {
    const page = await this.ensureBrowser();
    return page.title();
  }

  /**
   * Go back in history
   */
  async back(): Promise<NavigateResult> {
    try {
      const page = await this.ensureBrowser();
      await page.goBack();
      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    } catch (error) {
      return {
        success: false,
        url: '',
        title: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Go forward in history
   */
  async forward(): Promise<NavigateResult> {
    try {
      const page = await this.ensureBrowser();
      await page.goForward();
      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    } catch (error) {
      return {
        success: false,
        url: '',
        title: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Reload the page
   */
  async reload(): Promise<NavigateResult> {
    try {
      const page = await this.ensureBrowser();
      await page.reload();
      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    } catch (error) {
      return {
        success: false,
        url: '',
        title: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let browserInstance: PuppeteerBrowser | null = null;

/**
 * Get or create browser instance
 */
export function getBrowser(config?: BrowserConfig): PuppeteerBrowser {
  if (!browserInstance) {
    browserInstance = new PuppeteerBrowser(config);
  }
  return browserInstance;
}

/**
 * Create a new browser instance
 */
export function createBrowser(config?: BrowserConfig): PuppeteerBrowser {
  return new PuppeteerBrowser(config);
}

/**
 * Close the singleton browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
