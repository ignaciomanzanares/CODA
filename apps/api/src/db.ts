import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, gt, gte, lt, lte, ne, isNull, isNotNull, inArray, notInArray, sql, desc, asc } from 'drizzle-orm';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Import schema from packages
import * as schema from './schema.js';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// In production, fail if DATABASE_URL is missing
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is required in production. Set it in your environment variables.');
}

let db: any;
let sqlite: DatabaseType | undefined = undefined;

if (isProd) {
  // In production, always use PostgreSQL (handled by API, not this file)
  throw new Error('❌ Do not use SQLite in production. Use PostgreSQL via Drizzle ORM.');
} else {
  // Development: allow SQLite for local dev
  const dbPath = process.env.DATABASE_URL || join(__dirname, '..', '..', '..', 'packages', 'data', 'coda.db');
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  db = drizzle(sqlite, { schema });
}

export { db, sqlite };

// Re-export schema
export * from './schema.js';

// Re-export drizzle operators
export { eq, and, or, gt, gte, lt, lte, ne, isNull, isNotNull, inArray, notInArray, sql, desc, asc };

// SQLite is always available (file-based), so connection check always succeeds
export async function checkDatabaseConnection(): Promise<boolean> {
  console.log("🗄️  Using SQLite database");
  
  // Import and run seed functions to ensure demo data exists
  try {
    const { seedDemoUser, seedFinancialProducts } = await import('./seed.js');
    await seedDemoUser();
    await seedFinancialProducts();
  } catch (error) {
    console.warn("⚠️  Could not seed database:", error);
  }
  
  return true;
}
