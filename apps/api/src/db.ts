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

// Database path - relative to packages folder (going up to CODA root, then to packages/data)
const dbPath = process.env.DATABASE_URL || join(__dirname, '..', '..', '..', 'packages', 'data', 'coda.db');
const dbDir = dirname(dbPath);

// Ensure data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

console.log(`📂 Database path: ${dbPath}`);

// Create SQLite connection with WAL mode for better concurrency
const sqlite: DatabaseType = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Export raw sqlite for direct access if needed
export { sqlite };

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
