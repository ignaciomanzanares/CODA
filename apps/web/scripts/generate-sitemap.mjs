/**
 * Generates public/sitemap.xml with today's date as lastmod.
 * Route metadata sourced from scripts/seo-routes.mjs.
 *
 * Run: node scripts/generate-sitemap.mjs
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PUBLIC_ROUTES, BASE_URL } from "./seo-routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const today = new Date().toISOString().slice(0, 10);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.entries(PUBLIC_ROUTES)
  .map(
    ([path, route]) => `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq || "monthly"}</changefreq>
    <priority>${route.priority || "0.5"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

const outPath = join(__dirname, "..", "public", "sitemap.xml");
writeFileSync(outPath, xml, "utf8");
console.log(`Sitemap generated: ${outPath} (lastmod: ${today}, ${Object.keys(PUBLIC_ROUTES).length} URLs)`);
