/**
 * scripts/prerender.mjs
 *
 * Post-build static pre-render for public routes.
 * Reads dist/index.html and writes a route-specific HTML file for each
 * public route with correct <title>, <meta name="description">, and Open
 * Graph tags so link-preview bots and crawlers see useful markup.
 *
 * Route metadata is sourced from scripts/seo-routes.mjs (shared with
 * src/lib/seo-routes.ts which drives runtime SEO).
 *
 * Usage: node scripts/prerender.mjs   (run after `vite build`)
 * Called automatically via: npm run build
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PUBLIC_ROUTES, BASE_URL, DEFAULT_OG_IMAGE } from "./seo-routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

// ──────────────────────────────────────────────────────────────
// Inject meta tags into the base HTML
// ──────────────────────────────────────────────────────────────

function buildHtml(template, path, route) {
  const { title, description } = route;
  const image = route.ogImage || DEFAULT_OG_IMAGE;
  const canonicalUrl = `${BASE_URL}${path}`;

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
  return template.replace(/<title>[^<]*<\/title>/, "").replace("<head>", `<head>${metaBlock}`);
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

let count = 0;

for (const [path, route] of Object.entries(PUBLIC_ROUTES)) {
  const html = buildHtml(template, path, route);

  if (path === "/") {
    // Overwrite root index.html directly
    writeFileSync(join(distDir, "index.html"), html, "utf-8");
    console.log(`[prerender] /  →  dist/index.html`);
  } else {
    const routeDir = join(distDir, ...path.split("/").filter(Boolean));
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, "index.html"), html, "utf-8");
    console.log(`[prerender] ${path}  →  dist${path}/index.html`);
  }
  count++;
}

console.log(`[prerender] Done — ${count} routes pre-rendered.`);
