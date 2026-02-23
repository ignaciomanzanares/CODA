import type { Config } from "drizzle-kit";
import path from "path";
import { config as loadEnv } from "dotenv";

// Cargar apps/api/.env para que DATABASE_URL esté disponible al ejecutar db:push desde la raíz
loadEnv({ path: path.join(process.cwd(), "apps", "api", ".env") });

// Producción (Render) = PostgreSQL (DATABASE_URL). Local = SQLite (opcional).
const isPostgres = !!process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres");

const config: Config = {
  schema: "./packages/src/schema.ts",
  out: "./drizzle",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres
    ? { url: process.env.DATABASE_URL ?? "" }
    : { url: process.env.SQLITE_PATH ?? "./packages/data/coda.db" },
};

export default config;
