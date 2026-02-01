import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureTile() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
  
  const htmlPath = path.join(__dirname, 'tile-440x280.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  
  const outputPath = '/Users/simonfranco/Projects/secureagent/chrome-store-tile-440x280.png';
  await page.screenshot({
    path: outputPath,
    type: 'png',
    omitBackground: false,
    clip: { x: 0, y: 0, width: 440, height: 280 }
  });
  
  console.log(`Saved: ${outputPath}`);
  await browser.close();
}

captureTile();
