/**
 * Rota FIELD_ENCRYPTION_KEY: re-cifra con la llave ACTUAL todo valor aún cifrado con la anterior.
 *
 * Procedimiento:
 *   1. openssl rand -base64 32   # nueva llave
 *   2. Desplegar con FIELD_ENCRYPTION_KEY=<nueva> y FIELD_ENCRYPTION_KEY_PREV=<vieja>.
 *   3. DATABASE_URL="postgresql://..." FIELD_ENCRYPTION_KEY=<nueva> FIELD_ENCRYPTION_KEY_PREV=<vieja> \
 *        npm run db:rotate-encryption-key -w @coda/api -- [--dry-run] [--batch=500]
 *   4. Tras completar OK, quitar FIELD_ENCRYPTION_KEY_PREV en el siguiente deploy.
 *
 * Idempotente: solo toca lo que aún está con la llave vieja. Reanudable si se corta.
 * No-op si FIELD_ENCRYPTION_KEY_PREV no está configurada.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const batchSize = batchArg ? Number(batchArg.split("=")[1]) || 500 : 500;

  if (!process.env.FIELD_ENCRYPTION_KEY_PREV) {
    console.log("FIELD_ENCRYPTION_KEY_PREV no está definida → no hay nada que rotar. Aborta.");
    process.exit(0);
  }

  // Import dinámico tras dotenv (db/index y fieldEncryption leen env al importarse).
  const { rotateEncryptionKey } = await import("../services/crypto/keyRotation.js");
  console.log(`Rotando llave de cifrado (dryRun=${dryRun}, batch=${batchSize})...`);
  const res = await rotateEncryptionKey({ batchSize, dryRun });
  console.log(JSON.stringify(res, null, 2));
  if (dryRun) console.log("DRY RUN — no se escribió nada. Quita --dry-run para aplicar.");
  else console.log("Rotación aplicada. Tras verificar, quita FIELD_ENCRYPTION_KEY_PREV en el próximo deploy.");
  process.exit(0);
}

main().catch((e) => {
  console.error("rotate-encryption-key falló:", e);
  process.exit(1);
});
