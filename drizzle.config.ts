import type { Config } from "drizzle-kit";
import path from "path";
import { config as loadEnv } from "dotenv";
import { postgresUrlForDrizzleKit } from "./apps/api/src/db/postgresUrl.ts";

// Cargar apps/api/.env para que DATABASE_URL esté disponible al ejecutar db:push desde la raíz
loadEnv({ path: path.join(process.cwd(), "apps", "api", ".env") });

/**
 * Para `drizzle-kit push` contra Neon:
 * - Opcional: `DATABASE_URL_MIGRATE` = URL de conexión **directa** del dashboard (recomendado si db:push cuelga).
 * - Si solo tienes `DATABASE_URL` (p. ej. pooler de Render), intentamos convertir `-pooler` → host directo.
 */
const rawUrl =
  process.env.DATABASE_URL_MIGRATE?.trim() || process.env.DATABASE_URL?.trim() || "";
const isPostgres = !!rawUrl && rawUrl.startsWith("postgres");
const postgresUrl = isPostgres ? postgresUrlForDrizzleKit(rawUrl) : rawUrl;

const config: Config = {
  schema: "./packages/src/schema.ts",
  out: "./drizzle",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres
    ? { url: postgresUrl }
    : { url: process.env.SQLITE_PATH ?? "./packages/data/coda.db" },
};

export default config;
