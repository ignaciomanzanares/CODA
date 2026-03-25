// Drizzle ORM PostgreSQL client for production
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { ensurePostgresSslMode } from './db/postgresUrl.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('❌ DATABASE_URL is required for PostgreSQL connection.');
}

const url = ensurePostgresSslMode(connectionString);
// Neon/Render: sslmode=require en URL; rejectUnauthorized false evita fallos con algunos CAs en Node
const client = postgres(url, { ssl: { rejectUnauthorized: false } });

export const db = drizzle(client, { schema });
export * from './schema.js';
