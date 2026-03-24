/**
 * Genera public/og-image.png (1200×630) para Open Graph / Twitter.
 * Uso: node scripts/generate-og-image.mjs
 * Requiere: sharp (devDependency)
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");
const outFile = join(outDir, "og-image.png");

const W = 1200;
const H = 630;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>

  <text x="600" y="260" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="120" font-weight="700" fill="#ffffff">CODA</text>
  <text x="600" y="340" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="500" fill="#cbd5e1">Tu panel financiero personal</text>

  <text x="1160" y="590" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="28" font-weight="600" fill="#3b82f6">codafinance.cl</text>
</svg>`;

mkdirSync(outDir, { recursive: true });

await sharp(Buffer.from(svg))
  .resize(W, H)
  .png()
  .toFile(outFile);

console.log("OK:", outFile);
