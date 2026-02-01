#!/usr/bin/env node

/**
 * Capture Chrome Web Store screenshot
 * Creates a 1280x800 PNG without transparency
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureScreenshot() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set viewport to exact size
  await page.setViewport({
    width: 1280,
    height: 800,
    deviceScaleFactor: 1
  });

  // Load the HTML file
  const htmlPath = path.join(__dirname, 'screenshot-1280x800.html');
  console.log(`Loading: ${htmlPath}`);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Wait a moment for any animations
  await new Promise(resolve => setTimeout(resolve, 500));

  // Capture screenshot - PNG without transparency (omitBackground: false ensures solid background)
  const outputPath = '/Users/simonfranco/Projects/secureagent/chrome-store-screenshot.png';
  await page.screenshot({
    path: outputPath,
    type: 'png',
    omitBackground: false, // Keep the background (no transparency)
    clip: {
      x: 0,
      y: 0,
      width: 1280,
      height: 800
    }
  });

  console.log(`Screenshot saved to: ${outputPath}`);

  await browser.close();
  console.log('Done!');
}

captureScreenshot().catch(console.error);
