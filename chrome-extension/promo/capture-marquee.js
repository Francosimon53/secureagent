import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureMarquee() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.setViewport({ width: 1400, height: 560, deviceScaleFactor: 1 });

  const htmlPath = path.join(__dirname, 'marquee-1400x560.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));

  const outputPath = '/Users/simonfranco/Projects/secureagent/chrome-store-marquee-1400x560.png';
  await page.screenshot({
    path: outputPath,
    type: 'png',
    omitBackground: false,
    clip: { x: 0, y: 0, width: 1400, height: 560 }
  });

  console.log(`Saved: ${outputPath}`);
  await browser.close();
}

captureMarquee();
