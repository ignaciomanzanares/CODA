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

// Paleta de marca (naranjo #FF5C35 sobre fondo oscuro cálido, igual que la landing).
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0c0a09"/>
      <stop offset="100%" style="stop-color:#1a1210"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="25%" r="55%">
      <stop offset="0%" style="stop-color:#FF5C35;stop-opacity:0.18"/>
      <stop offset="100%" style="stop-color:#FF5C35;stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#FF5C35"/>
      <stop offset="100%" style="stop-color:#FF8A5B"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>

  <text x="600" y="260" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="120" font-weight="700" fill="url(#brand)">CODA</text>
  <text x="600" y="340" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="500" fill="#d6d3d1">Tu asistente financiero inteligente</text>

  <text x="1160" y="590" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="28" font-weight="600" fill="#e7e5e4">codafinance.cl</text>
</svg>`;

mkdirSync(outDir, { recursive: true });

await sharp(Buffer.from(svg)).resize(W, H).png().toFile(outFile);

console.log("OK:", outFile);
