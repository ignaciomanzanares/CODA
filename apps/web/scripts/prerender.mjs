/**
 * scripts/prerender.mjs
 *
 * Post-build static pre-render for public routes.
 * Reads dist/index.html and writes a route-specific HTML file for each
 * public route with correct <title>, <meta name="description">, and Open
 * Graph tags so link-preview bots and crawlers see useful markup.
 *
 * Usage: node scripts/prerender.mjs   (run after `vite build`)
 * Called automatically via: npm run build
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const baseUrl = "https://www.codafinance.cl";

// ──────────────────────────────────────────────────────────────
// Route definitions
// Each entry becomes its own dist/<path>/index.html
// ──────────────────────────────────────────────────────────────

const routes = [
  {
    path: "/",
    title: "CODA — Tu salud financiera en Chile",
    description:
      "Sube tu cartola, obtén tu score dual y descubre los mejores productos financieros personalizados para ti. Gratis y seguro.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/acerca",
    title: "Nosotros · CODA",
    description:
      "Conoce el equipo detrás de CODA, nuestra misión de democratizar la salud financiera en Chile y nuestra inscripción CMF.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/productos",
    title: "Productos financieros chilenos · CODA",
    description:
      "Compara créditos, tarjetas, cuentas, depósitos a plazo, fondos mutuos, APV y más. Ranking personalizado según tu perfil.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/info/score-credito",
    title: "Score crediticio en Chile · CODA",
    description:
      "Aprende cómo funciona el score CMF en Chile, qué lo afecta y cómo mejorar tu historial crediticio paso a paso.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/metodologia",
    title: "Metodología de scoring CODA",
    description:
      "Transparencia total: así calculamos el score transaccional CODA a partir de tus movimientos bancarios y datos CMF.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/instituciones",
    title: "CODA para instituciones financieras",
    description:
      "Integra el score transaccional CODA en tus procesos de evaluación crediticia. Contacta al equipo comercial.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/privacidad",
    title: "Política de privacidad · CODA",
    description:
      "CODA cumple con la Ley 19.628 y la Ley Fintec 21.521. Conoce cómo protegemos y usamos tus datos financieros.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/terminos",
    title: "Términos y condiciones · CODA",
    description:
      "Condiciones de uso de la plataforma CODA de Chile Open-Data Analytics SpA.",
    image: `${baseUrl}/og-image.png`,
  },
  {
    path: "/info/comparacion-productos",
    title: "Comparación de productos financieros · CODA",
    description:
      "Compara lado a lado créditos, tarjetas y cuentas de los principales bancos y cooperativas de Chile.",
    image: `${baseUrl}/og-image.png`,
  },
];

// ──────────────────────────────────────────────────────────────
// Inject meta tags into the base HTML
// ──────────────────────────────────────────────────────────────

function buildHtml(template, route) {
  const { title, description, image, path: routePath } = route;
  const canonicalUrl = `${baseUrl}${routePath}`;

  const metaBlock = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:locale" content="es_CL" />
    <meta property="og:site_name" content="CODA" />
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />`;

  // Replace the generic <title>CODA</title> and inject meta after <head>
  return template
    .replace(/<title>[^<]*<\/title>/, "")
    .replace("<head>", `<head>${metaBlock}`);
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

const templatePath = join(distDir, "index.html");
let template;

try {
  template = readFileSync(templatePath, "utf-8");
} catch {
  console.error("[prerender] dist/index.html not found — run `vite build` first.");
  process.exit(1);
}

for (const route of routes) {
  const html = buildHtml(template, route);

  if (route.path === "/") {
    // Overwrite root index.html directly
    writeFileSync(join(distDir, "index.html"), html, "utf-8");
    console.log(`[prerender] /  →  dist/index.html`);
  } else {
    const routeDir = join(distDir, ...route.path.split("/").filter(Boolean));
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, "index.html"), html, "utf-8");
    console.log(`[prerender] ${route.path}  →  dist${route.path}/index.html`);
  }
}

console.log(`[prerender] Done — ${routes.length} routes pre-rendered.`);
