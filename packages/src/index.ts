import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, gt, gte, lt, lte, ne, isNull, isNotNull, inArray, notInArray, sql, desc, asc } from 'drizzle-orm';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - relative to packages folder
const dbPath = process.env.DATABASE_URL || join(__dirname, '..', 'data', 'coda.db');
const dbDir = dirname(dbPath);

// Ensure data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create SQLite connection with WAL mode for better concurrency
const sqlite: DatabaseType = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Export raw sqlite for direct access if needed
export { sqlite };

// Re-export schema
export * from './schema.js';

// Re-export drizzle operators to avoid version conflicts
export { eq, and, or, gt, gte, lt, lte, ne, isNull, isNotNull, inArray, notInArray, sql, desc, asc };
