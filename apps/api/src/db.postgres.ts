// Drizzle ORM PostgreSQL client for production
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('❌ DATABASE_URL is required for PostgreSQL connection.');
}

// Use SSL if required by the connection string
const ssl = connectionString.includes('sslmode=require');
const client = postgres(connectionString, { ssl });

export const db = drizzle(client, { schema });
export * from './schema.js';
