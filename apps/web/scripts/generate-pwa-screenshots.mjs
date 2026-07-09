#!/usr/bin/env node
/**
 * Generates install-surface screenshots for the Web App Manifest.
 *
 * These are deterministic product mockups, not live browser captures. Keeping
 * them generated avoids stale blue placeholder assets when the brand palette
 * changes.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "screenshots");

const colors = {
  bg: "#0c0a09",
  panel: "#18181b",
  panel2: "#202124",
  border: "#34302d",
  text: "#fff7ed",
  muted: "#a8a29e",
  soft: "#78716c",
  orange: "#FF5C35",
  orange2: "#ff8a5b",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#38bdf8",
};
const font = "DejaVu Sans, Arial, Helvetica, sans-serif";

function money(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function card({ x, y, w, h, title, value, accent = colors.orange, sub = "" }) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${colors.panel}" stroke="${colors.border}" stroke-width="2"/>
      <text x="${x + 34}" y="${y + 58}" font-size="24" font-weight="700" fill="${colors.muted}" letter-spacing="2">${title}</text>
      <text x="${x + 34}" y="${y + 118}" font-size="48" font-weight="800" fill="${accent}">${value}</text>
      ${sub ? `<text x="${x + 34}" y="${y + 164}" font-size="24" font-weight="600" fill="${colors.muted}">${sub}</text>` : ""}
    </g>`;
}

function scoreRing(cx, cy, r, score, label) {
  const circumference = 2 * Math.PI * r;
  const progress = 0.78;
  const dash = circumference * progress;
  const gap = circumference - dash;
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#292524" stroke-width="28"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.orange}" stroke-width="28"
        stroke-linecap="round" stroke-dasharray="${dash} ${gap}" transform="rotate(-92 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="70" font-weight="850" fill="${colors.text}">${score}</text>
      <text x="${cx}" y="${cy + 48}" text-anchor="middle" font-size="26" font-weight="600" fill="${colors.muted}">${label}</text>
    </g>`;
}

function miniBarChart(x, y, w, h) {
  const bars = [0.42, 0.74, 0.56, 0.84, 0.64, 0.92];
  const gap = 18;
  const bw = (w - gap * (bars.length - 1)) / bars.length;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${colors.panel}" stroke="${colors.border}" stroke-width="2"/>
      <text x="${x + 34}" y="${y + 58}" font-size="24" font-weight="700" fill="${colors.muted}" letter-spacing="2">FLUJO MENSUAL</text>
      ${bars.map((v, i) => {
        const bh = Math.round((h - 128) * v);
        const bx = x + 34 + i * (bw + gap);
        const by = y + h - 42 - bh;
        return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="${i % 2 ? colors.orange : colors.orange2}" opacity="${i % 2 ? "1" : "0.78"}"/>`;
      }).join("")}
    </g>`;
}

function checklist(x, y, w, h, compact = false) {
  const rows = compact
    ? [
        ["Score dual", "Listo"],
        ["Gastos", "Listo"],
        ["Productos", "3 opciones"],
      ]
    : [
        ["Score dual actualizado", "Listo"],
        ["Gastos categorizados", "Listo"],
        ["Productos recomendados", "3 opciones"],
      ];
  const labelSize = compact ? 24 : 28;
  const statusSize = compact ? 21 : 24;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${colors.panel}" stroke="${colors.border}" stroke-width="2"/>
      <text x="${x + 34}" y="${y + 58}" font-size="24" font-weight="700" fill="${colors.muted}" letter-spacing="2">DIAGNOSTICO</text>
      ${rows.map(([label, status], i) => {
        const ry = y + 112 + i * 66;
        return `
          <circle cx="${x + 48}" cy="${ry - 8}" r="13" fill="${colors.orange}"/>
          <path d="M${x + 41} ${ry - 8} l5 6 l10 -14" fill="none" stroke="${colors.text}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="${x + 78}" y="${ry}" font-size="${labelSize}" font-weight="700" fill="${colors.text}">${label}</text>
          <text x="${x + w - 34}" y="${ry}" text-anchor="end" font-size="${statusSize}" font-weight="700" fill="${colors.orange2}">${status}</text>`;
      }).join("")}
    </g>`;
}

function header(x, y, width) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="60" height="60" rx="18" fill="${colors.orange}"/>
      <path d="M${x + 20} ${y + 20} h20 a7 7 0 0 1 7 7 v13 a7 7 0 0 1 -7 7 h-20 a7 7 0 0 1 -7 -7 v-13 a7 7 0 0 1 7 -7z" fill="none" stroke="${colors.text}" stroke-width="4"/>
      <path d="M${x + 39} ${y + 31} h11 v13 h-11 a6 6 0 0 1 0 -13z" fill="${colors.orange}" stroke="${colors.text}" stroke-width="4"/>
      <circle cx="${x + 42}" cy="${y + 37}" r="2.5" fill="${colors.text}"/>
      <text x="${x + 82}" y="${y + 41}" font-size="34" font-weight="850" fill="${colors.text}">CODA</text>
      <text x="${x + width}" y="${y + 38}" text-anchor="end" font-size="22" font-weight="700" fill="${colors.muted}">Salud financiera</text>
    </g>`;
}

function mobileSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${font}">
    <rect width="1080" height="1920" fill="${colors.bg}"/>
    <circle cx="980" cy="-80" r="360" fill="${colors.orange}" opacity="0.12"/>
    ${header(64, 92, 950)}
    <text x="64" y="240" font-size="58" font-weight="850" fill="${colors.text}">Tu panel financiero</text>
    <text x="64" y="290" font-size="28" font-weight="600" fill="${colors.muted}">Score, gastos y recomendaciones en una sola vista.</text>
    ${card({ x: 64, y: 360, w: 952, h: 214, title: "PATRIMONIO NETO", value: money(4820000), accent: colors.text, sub: "+12,4% este mes" })}
    ${card({ x: 64, y: 616, w: 452, h: 188, title: "INGRESOS", value: money(1250000), accent: colors.green })}
    ${card({ x: 564, y: 616, w: 452, h: 188, title: "GASTOS", value: money(890000), accent: colors.red })}
    <rect x="64" y="854" width="952" height="420" rx="34" fill="${colors.panel2}" stroke="${colors.border}" stroke-width="2"/>
    ${scoreRing(540, 1048, 132, 720, "Score crediticio")}
    <text x="540" y="1208" text-anchor="middle" font-size="30" font-weight="750" fill="${colors.muted}">Riesgo bajo - cupos recomendados</text>
    ${checklist(64, 1324, 952, 300)}
    <text x="540" y="1768" text-anchor="middle" font-size="64" font-weight="900" fill="${colors.orange}">CODA</text>
    <text x="540" y="1822" text-anchor="middle" font-size="28" font-weight="600" fill="${colors.muted}">Datos reales. Decisiones claras.</text>
  </svg>`;
}

function desktopSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="${font}">
    <rect width="1920" height="1080" fill="${colors.bg}"/>
    <circle cx="1720" cy="-180" r="520" fill="${colors.orange}" opacity="0.11"/>
    ${header(60, 56, 1800)}
    <text x="60" y="188" font-size="58" font-weight="850" fill="${colors.text}">Panel CODA</text>
    <text x="60" y="232" font-size="26" font-weight="600" fill="${colors.muted}">Diagnostico financiero con score dual y productos personalizados.</text>
    ${card({ x: 60, y: 296, w: 500, h: 190, title: "PATRIMONIO NETO", value: money(4820000), accent: colors.text, sub: "+12,4% este mes" })}
    ${card({ x: 592, y: 296, w: 360, h: 190, title: "INGRESOS", value: money(1250000), accent: colors.green })}
    ${card({ x: 984, y: 296, w: 360, h: 190, title: "GASTOS", value: money(890000), accent: colors.red })}
    ${card({ x: 1376, y: 296, w: 484, h: 190, title: "AHORRO", value: "28,8%", accent: colors.orange })}
    ${miniBarChart(60, 532, 846, 360)}
    <rect x="946" y="532" width="448" height="360" rx="34" fill="${colors.panel2}" stroke="${colors.border}" stroke-width="2"/>
    ${scoreRing(1170, 708, 112, 720, "Score crediticio")}
    ${checklist(1434, 532, 426, 360, true)}
    <text x="960" y="1012" text-anchor="middle" font-size="56" font-weight="900" fill="${colors.orange}">CODA</text>
  </svg>`;
}

await mkdir(outDir, { recursive: true });

await sharp(Buffer.from(mobileSvg())).png().toFile(join(outDir, "mobile-dashboard.png"));
await sharp(Buffer.from(desktopSvg())).png().toFile(join(outDir, "desktop-dashboard.png"));

console.log(`Wrote ${join(outDir, "mobile-dashboard.png")}`);
console.log(`Wrote ${join(outDir, "desktop-dashboard.png")}`);
