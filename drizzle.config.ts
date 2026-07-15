import type { Config } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { postgresUrlForDrizzleKit } from "./apps/api/src/db/postgresUrl.ts";

/** Directorio del monorepo (donde está este archivo), no `process.cwd()` — así db:push funciona desde `CODA/` o desde `packages/`. */
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// Cargar apps/api/.env
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });

/**
 * Para `drizzle-kit push` contra Neon:
 * - Opcional: `DATABASE_URL_MIGRATE` = URL de conexión **directa** del dashboard (recomendado si db:push cuelga).
 * - Si solo tienes `DATABASE_URL` (p. ej. pooler de Render), intentamos convertir `-pooler` → host directo.
 */
const rawUrl = process.env.DATABASE_URL_MIGRATE?.trim() || process.env.DATABASE_URL?.trim() || "";
const isPostgres = !!rawUrl && rawUrl.startsWith("postgres");
const postgresUrl = isPostgres ? postgresUrlForDrizzleKit(rawUrl) : rawUrl;

// Guardia anti-footgun: `db:push` genera DDL desde el schema, que NO declara
// índices (viven solo en migrations/*.sql) — contra una BD ya migrada puede
// DROPear los índices de producción. Y como este config carga apps/api/.env,
// un `npm run db:push` local inocente apunta a Neon sin que se note.
// Postgres exige opt-in explícito; el camino normal es `npm run db:migrate`.
if (isPostgres && process.env.DB_PUSH_ALLOW_POSTGRES !== "true") {
  throw new Error(
    `db:push apunta a Postgres (${postgresUrl.replace(/\/\/[^@]*@/, "//***@")}). ` +
      "Solo para una BD nueva/vacía: reintenta con DB_PUSH_ALLOW_POSTGRES=true. " +
      "Para una BD existente usa `npm run db:migrate` (los índices viven en migrations/).",
  );
}

const config: Config = {
  schema: path.join(repoRoot, "packages/src/schema.ts"),
  out: path.join(repoRoot, "drizzle"),
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres
    ? { url: postgresUrl }
    : { url: process.env.SQLITE_PATH ?? path.join(repoRoot, "packages/data/coda.db") },
};

export default config;
