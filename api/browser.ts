/**
 * Browser Automation API Endpoint
 *
 * REST API for browser automation using Puppeteer.
 * Supports navigation, screenshots, clicking, typing, and data extraction.
 *
 * Endpoints:
 * - POST /api/browser?action=navigate - Navigate to URL
 * - POST /api/browser?action=screenshot - Take screenshot
 * - POST /api/browser?action=click - Click element
 * - POST /api/browser?action=type - Type text
 * - POST /api/browser?action=extract - Extract text/HTML
 * - POST /api/browser?action=fill - Fill form
 * - POST /api/browser?action=query - Query elements
 * - POST /api/browser?action=evaluate - Execute JavaScript
 * - GET /api/browser - API documentation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PuppeteerBrowser } from '../src/tools/browser.js';

// Session storage (in-memory for serverless - consider Redis for production)
const sessions = new Map<string, PuppeteerBrowser>();

// Session cleanup timeout (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;
const sessionTimers = new Map<string, NodeJS.Timeout>();

function getOrCreateSession(sessionId: string): PuppeteerBrowser {
  let browser = sessions.get(sessionId);
  if (!browser) {
    browser = new PuppeteerBrowser();
    sessions.set(sessionId, browser);
  }

  // Reset cleanup timer
  const existingTimer = sessionTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    const b = sessions.get(sessionId);
    if (b) {
      await b.close();
      sessions.delete(sessionId);
      sessionTimers.delete(sessionId);
    }
  }, SESSION_TIMEOUT);

  sessionTimers.set(sessionId, timer);

  return browser;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;
  const action = query.action as string | undefined;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse body
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid JSON in request body',
      });
    }
  }

  const sessionId = (body.sessionId as string) || 'default';

  try {
    // GET /api/browser - API documentation
    if (method === 'GET' && !action) {
      return res.status(200).json({
        name: 'Browser Automation API',
        version: '1.0.0',
        description: 'Control a headless browser via REST API',
        endpoints: {
          navigate: {
            method: 'POST',
            path: '/api/browser?action=navigate',
            body: { url: 'string (required)', waitUntil: 'load|domcontentloaded|networkidle0|networkidle2', sessionId: 'string (optional)' },
          },
          screenshot: {
            method: 'POST',
            path: '/api/browser?action=screenshot',
            body: { fullPage: 'boolean', selector: 'string', format: 'png|jpeg|webp', quality: 'number (0-100)', sessionId: 'string' },
          },
          click: {
            method: 'POST',
            path: '/api/browser?action=click',
            body: { selector: 'string (required)', button: 'left|right|middle', clickCount: 'number', sessionId: 'string' },
          },
          type: {
            method: 'POST',
            path: '/api/browser?action=type',
            body: { selector: 'string (required)', text: 'string (required)', delay: 'number (ms)', clear: 'boolean', sessionId: 'string' },
          },
          extract: {
            method: 'POST',
            path: '/api/browser?action=extract',
            body: { selector: 'string', type: 'text|html', sessionId: 'string' },
          },
          fill: {
            method: 'POST',
            path: '/api/browser?action=fill',
            body: { fields: 'Record<selector, value>', sessionId: 'string' },
          },
          query: {
            method: 'POST',
            path: '/api/browser?action=query',
            body: { selector: 'string (required)', limit: 'number (default 10)', sessionId: 'string' },
          },
          evaluate: {
            method: 'POST',
            path: '/api/browser?action=evaluate',
            body: { script: 'string (required)', sessionId: 'string' },
          },
          close: {
            method: 'DELETE',
            path: '/api/browser?action=close',
            body: { sessionId: 'string' },
          },
        },
        notes: [
          'Sessions auto-close after 5 minutes of inactivity',
          'Use sessionId to maintain browser state across requests',
          'Navigate must be called before other actions',
        ],
      });
    }

    // DELETE /api/browser?action=close - Close session
    if (method === 'DELETE' && action === 'close') {
      const browser = sessions.get(sessionId);
      if (browser) {
        await browser.close();
        sessions.delete(sessionId);
        const timer = sessionTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          sessionTimers.delete(sessionId);
        }
      }
      return res.status(200).json({
        success: true,
        message: `Session ${sessionId} closed`,
      });
    }

    // All other actions require POST
    if (method !== 'POST') {
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Use POST for browser actions',
      });
    }

    const browser = getOrCreateSession(sessionId);

    // POST /api/browser?action=navigate
    if (action === 'navigate') {
      const { url, waitUntil } = body;
      if (!url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'url is required',
        });
      }

      const result = await browser.navigate(url, waitUntil);
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=screenshot
    if (action === 'screenshot') {
      const { fullPage, selector, format, quality } = body;
      const result = await browser.screenshot({ fullPage, selector, format, quality });
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=click
    if (action === 'click') {
      const { selector, button, clickCount } = body;
      if (!selector) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'selector is required',
        });
      }

      const result = await browser.click(selector, { button, clickCount });
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=type
    if (action === 'type') {
      const { selector, text, delay, clear } = body;
      if (!selector || text === undefined) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'selector and text are required',
        });
      }

      const result = await browser.type(selector, text, { delay, clear });
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=extract
    if (action === 'extract') {
      const { selector, type } = body;
      const result = type === 'html'
        ? await browser.extractHtml(selector)
        : await browser.extractText(selector);
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=fill
    if (action === 'fill') {
      const { fields } = body;
      if (!fields || typeof fields !== 'object') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'fields object is required',
        });
      }

      const result = await browser.fillForm(fields);
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=query
    if (action === 'query') {
      const { selector, limit } = body;
      if (!selector) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'selector is required',
        });
      }

      const result = await browser.query(selector, limit);
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=evaluate
    if (action === 'evaluate') {
      const { script } = body;
      if (!script) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'script is required',
        });
      }

      const result = await browser.evaluate(script);
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=wait
    if (action === 'wait') {
      const { selector, timeout } = body;
      if (!selector) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'selector is required',
        });
      }

      const result = await browser.waitFor(selector, timeout);
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=back
    if (action === 'back') {
      const result = await browser.back();
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=forward
    if (action === 'forward') {
      const result = await browser.forward();
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    // POST /api/browser?action=reload
    if (action === 'reload') {
      const result = await browser.reload();
      return res.status(result.success ? 200 : 400).json({
        ...result,
        sessionId,
      });
    }

    return res.status(400).json({
      error: 'Bad Request',
      message: `Unknown action: ${action}`,
      validActions: ['navigate', 'screenshot', 'click', 'type', 'extract', 'fill', 'query', 'evaluate', 'wait', 'back', 'forward', 'reload', 'close'],
    });

  } catch (error) {
    console.error('Browser API error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
      sessionId,
    });
  }
}
