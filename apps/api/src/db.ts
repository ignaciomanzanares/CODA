import { env } from './env.js';
let db: any;
let sqlite: any = undefined;

if (env.nodeEnv === 'production') {
  // Use PostgreSQL Drizzle client in production
  const pg = await import('./db.postgres.js');
  db = pg.db;
} else {
  // Use SQLite Drizzle client in development
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { existsSync, mkdirSync } = await import('fs');
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');
  const schema = await import('./schema.js');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
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

// Re-export schema and Drizzle ORM operators only once
export * from './schema.js';
export { eq, and, or, gt, gte, lt, lte, ne, isNull, isNotNull, inArray, notInArray, sql, desc, asc } from 'drizzle-orm';

// Check database connection for both environments
export async function checkDatabaseConnection(): Promise<boolean> {
  if (env.nodeEnv === 'production') {
    // Try a simple query on PostgreSQL
    try {
      await db.query`SELECT 1`;
      console.log('🐘 Connected to PostgreSQL database');
      return true;
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
      return false;
    }
  } else {
    // SQLite: run seeders for dev
    console.log('🗄️  Using SQLite database');
    try {
      const { seedDemoUser, seedFinancialProducts } = await import('./seed.js');
      await seedDemoUser();
      await seedFinancialProducts();
    } catch (error) {
      console.warn('⚠️  Could not seed database:', error);
    }
    return true;
  }
}
