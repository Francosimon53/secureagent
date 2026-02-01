#!/usr/bin/env node

/**
 * Generate extension icons
 * Creates PNG icons from an SVG template
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SVG icon template
const svgIcon = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-weight="bold" font-size="${size * 0.4}" fill="white">
    SA
  </text>
</svg>
`;

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating extension icons...');

sizes.forEach((size) => {
  const svg = svgIcon(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg.trim());
  console.log(`Created: ${filename}`);
});

console.log(`
Icons generated as SVG files.

To convert to PNG (required for Chrome):
1. Use an online converter like https://cloudconvert.com/svg-to-png
2. Or use ImageMagick: convert icon128.svg icon128.png

For development, you can also use the SVG files directly by updating manifest.json.
`);
