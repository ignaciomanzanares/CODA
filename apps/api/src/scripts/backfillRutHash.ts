/**
 * Backfill de users.rut_hash a partir de users.rut (texto plano, legacy) para usuarios
 * existentes creados antes de la migración 035.
 *
 * Procedimiento:
 *   1. Migración 035 ya aplicada (agrega rut_hash, ver migrations/035_users_rut_hash.sql).
 *   2. RUT_HASH_PEPPER configurada en el entorno.
 *   3. DATABASE_URL="postgresql://..." RUT_HASH_PEPPER=<pepper> \
 *        npm run db:backfill-rut-hash -w @coda/api -- [--dry-run]
 *   4. Verificar que no queden usuarios con `rut` no nulo y `rut_hash` nulo (el resumen final
 *      del script lo reporta).
 *   5. Solo entonces: agregar una migración nueva que haga `DROP COLUMN rut` + `DROP INDEX
 *      users_rut_unique`, y borrar el campo `rut` de packages/src/schema.ts.
 *
 * Idempotente: solo toca filas con `rut` no nulo y `rut_hash` nulo. Reanudable si se corta.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  // Imports dinámicos tras dotenv (db/index y env leen process.env al importarse).
  const { db, users, isNull, and, isNotNull, eq } = await import("../db/index.js");
  const { hashRut } = await import("../services/crypto/identifierHashing.js");

  if (!db) {
    console.error("Base de datos no disponible (falta DATABASE_URL).");
    process.exit(1);
  }

  const pending = await db
    .select({ id: users.id, rut: users.rut })
    .from(users)
    .where(and(isNotNull(users.rut), isNull(users.rutHash)));

  console.log(`${pending.length} usuario(s) con rut sin rut_hash.`);

  let updated = 0;
  for (const row of pending) {
    if (!row.rut) continue;
    const rutHash = hashRut(row.rut);
    if (!dryRun) {
      await db.update(users).set({ rutHash }).where(eq(users.id, row.id));
    }
    updated++;
  }

  console.log(`${updated} usuario(s) ${dryRun ? "necesitarían" : ""} backfill de rut_hash.`);
  if (dryRun) {
    console.log("DRY RUN — no se escribió nada. Quita --dry-run para aplicar.");
  } else {
    const remaining = await db
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.rut), isNull(users.rutHash)));
    console.log(
      remaining.length > 0
        ? `Aún quedan ${remaining.length} fila(s) sin backfillear (revisar).`
        : "Backfill completo: 0 usuarios con rut sin rut_hash.",
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("backfillRutHash falló:", e);
  process.exit(1);
});
