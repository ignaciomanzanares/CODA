import type { Config } from 'drizzle-kit';


// Dynamically select dialect and dbCredentials based on DATABASE_URL
const isPostgres = !!process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres');
const isSQLite = !process.env.DATABASE_URL || process.env.DATABASE_URL.endsWith('.db');

const config: Config = {
  schema: './packages/src/schema.ts',
  out: './drizzle',
  dialect: isPostgres ? 'postgresql' : 'sqlite',
  dbCredentials: isPostgres
    ? { url: process.env.DATABASE_URL || '' }
    : { url: process.env.SQLITE_PATH || './packages/data/coda.db' },
};

export default config;
