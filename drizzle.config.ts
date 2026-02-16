import type { Config } from "drizzle-kit";

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
