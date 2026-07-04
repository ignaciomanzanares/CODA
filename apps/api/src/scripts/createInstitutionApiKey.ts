/**
 * Genera y registra una API key para una institución financiera (API de leads, Fase 2).
 *
 * Muestra la key EN CLARO una sola vez (no se puede recuperar después: en la DB solo queda el
 * hash). Entregarla a la institución por un canal seguro.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." npm run db:create-institution-key -w @coda/api -- \
 *     --provider="BancoEstado" --label="Integración producción"
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const args = process.argv.slice(2);
  const provider = args.find((a) => a.startsWith("--provider="))?.split("=").slice(1).join("=");
  const label = args.find((a) => a.startsWith("--label="))?.split("=").slice(1).join("=") ?? null;

  if (!provider) {
    console.error('Falta --provider="Nombre Institución" (debe matchear financial_products.provider).');
    process.exit(1);
  }

  const { db, institutionApiKeys } = await import("../db/index.js");
  const { generateApiKey, hashApiKey } = await import("../services/institutions/institutionAuth.js");
  if (!db) {
    console.error("Base de datos no disponible (falta DATABASE_URL).");
    process.exit(1);
  }

  const apiKey = generateApiKey();
  await db.insert(institutionApiKeys).values({
    provider,
    keyHash: hashApiKey(apiKey),
    label,
    active: 1,
    createdAt: new Date().toISOString(),
  });

  console.log(`\nAPI key creada para "${provider}"${label ? ` (${label})` : ""}.`);
  console.log("Guárdala ahora — no se puede recuperar después:\n");
  console.log(`  ${apiKey}\n`);
  console.log("Uso por la institución: header  X-API-Key: <la key>\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("createInstitutionApiKey falló:", e);
  process.exit(1);
});
