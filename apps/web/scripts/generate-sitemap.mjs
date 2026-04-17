/**
 * Generates public/sitemap.xml with today's date as lastmod.
 * Run: node scripts/generate-sitemap.mjs
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: "/", changefreq: "weekly", priority: "1.0" },
  { loc: "/registro", changefreq: "monthly", priority: "0.9" },
  { loc: "/iniciar-sesion", changefreq: "monthly", priority: "0.7" },
  { loc: "/acerca", changefreq: "monthly", priority: "0.7" },
  { loc: "/info/score-credito", changefreq: "monthly", priority: "0.8" },
  { loc: "/info/comparacion-productos", changefreq: "monthly", priority: "0.6" },
  { loc: "/info/metas-financieras", changefreq: "monthly", priority: "0.6" },
  { loc: "/info/riesgo-seguros", changefreq: "monthly", priority: "0.6" },
  { loc: "/metodologia", changefreq: "monthly", priority: "0.5" },
  { loc: "/instituciones", changefreq: "monthly", priority: "0.5" },
  { loc: "/empresas", changefreq: "monthly", priority: "0.5" },
  { loc: "/privacidad", changefreq: "monthly", priority: "0.4" },
  { loc: "/terminos", changefreq: "monthly", priority: "0.4" },
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>https://www.codafinance.cl${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

const outPath = join(__dirname, "..", "public", "sitemap.xml");
writeFileSync(outPath, xml, "utf8");
console.log(`Sitemap generated: ${outPath} (lastmod: ${today})`);
