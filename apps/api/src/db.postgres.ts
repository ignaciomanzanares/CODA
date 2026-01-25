// Drizzle ORM PostgreSQL client for production
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('❌ DATABASE_URL is required for PostgreSQL connection.');
}

// Always use SSL for managed Postgres (Render, etc.)
const client = postgres(connectionString, { ssl: { rejectUnauthorized: false } });

export const db = drizzle(client, { schema });
export * from './schema.js';
