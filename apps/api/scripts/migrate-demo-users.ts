/**
 * One-off, idempotente: reasocia filas huérfanas que quedaron con
 * `userId = email.split('@')[0]` (el viejo login demo sin fila real en `users`,
 * cerrado en este mismo cambio) a la fila real del usuario en `users`.
 *
 * Para cada tabla con columna `user_id`, busca valores que no existen en
 * `users.id` y, si ese valor coincide con `users.username` de exactamente una
 * fila, reescribe `user_id` a `users.id`. Si hay ambigüedad o no hay match,
 * deja la fila intacta y lo reporta — no inventa una asociación.
 *
 * SQL: los valores siempre viajan como parámetros (binding de drizzle); solo
 * los identificadores de tabla/columna —que provienen de la lista hardcodeada
 * de abajo, nunca de input— se interpolan vía `sql.raw()`.
 *
 * Funciona en ambos dialectos: Postgres (`db.execute`) y SQLite (`db.all`/`db.run`).
 *
 * Uso:
 *   npx tsx apps/api/scripts/migrate-demo-users.ts          # dry-run (solo reporta)
 *   npx tsx apps/api/scripts/migrate-demo-users.ts --apply  # aplica los UPDATE
 */
import type { SQL } from "drizzle-orm";
import { db, dialect, sql } from "../src/db/index.js";

const TABLES_WITH_USER_ID = [
  "bank_connections",
  "financial_goals",
  "expenses",
  "bill_splits",
  "notifications",
  "push_subscriptions",
  "consent_grants",
  "document_uploads",
  "user_scores",
  "credit_score_history",
  "assistant_feedback",
  "assistant_summaries",
  "habit_feedback",
  "user_assets",
  "transactional_scores",
  "credit_scores",
];

const apply = process.argv.includes("--apply");

/** SELECT dialect-aware: Postgres devuelve filas vía db.execute; SQLite vía db.all. */
async function runSelect<T>(query: SQL): Promise<T[]> {
  if (dialect === "postgres") {
    const res = await db.execute(query);
    // postgres-js drizzle devuelve un array-like de filas
    return (Array.isArray(res) ? res : (res?.rows ?? [])) as T[];
  }
  return db.all(query) as T[];
}

/** Ejecuta una mutación dialect-aware. */
async function runExec(query: SQL): Promise<void> {
  if (dialect === "postgres") {
    await db.execute(query);
    return;
  }
  db.run(query);
}

/** True solo si la tabla existe Y tiene columna `user_id` (filtra drift de esquema). */
async function hasUserIdColumn(table: string): Promise<boolean> {
  try {
    if (dialect === "postgres") {
      const rows = await runSelect<{ column_name: string }>(
        sql`SELECT column_name FROM information_schema.columns
            WHERE table_name = ${table} AND column_name = 'user_id'`,
      );
      return rows.length > 0;
    }
    // SQLite: PRAGMA no acepta parámetros; el nombre viene de la lista hardcodeada.
    const rows = await runSelect<{ name: string }>(
      sql`SELECT name FROM pragma_table_info(${table})`,
    );
    return rows.some((r) => r.name === "user_id");
  } catch {
    return false;
  }
}

async function migrateTable(
  table: string,
  applyChanges: boolean = apply,
): Promise<{ table: string; orphans: number; migrated: number; ambiguous: string[] }> {
  // El identificador de tabla es de la lista hardcodeada: seguro para sql.raw.
  const t = sql.raw(`"${table}"`);

  const orphanRows = await runSelect<{ user_id: string }>(
    sql`SELECT DISTINCT ${t}.user_id as user_id
        FROM ${t}
        LEFT JOIN users ON users.id = ${t}.user_id
        WHERE users.id IS NULL AND ${t}.user_id IS NOT NULL`,
  );

  let migrated = 0;
  const ambiguous: string[] = [];

  for (const { user_id: orphanId } of orphanRows) {
    const candidates = await runSelect<{ id: string }>(
      sql`SELECT id FROM users WHERE username = ${orphanId}`,
    );

    if (candidates.length !== 1) {
      ambiguous.push(orphanId);
      continue;
    }

    const realId = candidates[0].id;
    if (applyChanges) {
      await runExec(sql`UPDATE ${t} SET user_id = ${realId} WHERE user_id = ${orphanId}`);
    }
    migrated += 1;
  }

  return { table, orphans: orphanRows.length, migrated, ambiguous };
}

async function main() {
  console.log(`[migrate-demo-users] dialect=${dialect} mode=${apply ? "APPLY" : "dry-run"}`);
  let totalOrphans = 0;
  let totalMigrated = 0;

  for (const table of TABLES_WITH_USER_ID) {
    if (!(await hasUserIdColumn(table))) continue;
    const result = await migrateTable(table);
    totalOrphans += result.orphans;
    totalMigrated += result.migrated;
    if (result.orphans > 0) {
      console.log(
        `  ${result.table}: ${result.orphans} userId huérfano(s), ${result.migrated} ${apply ? "migrado(s)" : "migrable(s)"}` +
          (result.ambiguous.length ? `, sin match único: ${result.ambiguous.join(", ")}` : ""),
      );
    }
  }

  console.log(
    `[migrate-demo-users] total: ${totalOrphans} huérfanos, ${totalMigrated} ${apply ? "migrados" : "migrables (re-ejecuta con --apply)"}`,
  );
}

export { hasUserIdColumn, migrateTable, runSelect, runExec };

// Solo auto-ejecuta cuando se corre como script (no al importarlo desde un test).
if (!process.env.VITEST) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[migrate-demo-users] error:", err);
      process.exit(1);
    });
}
