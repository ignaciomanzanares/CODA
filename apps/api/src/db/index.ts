// Centralized Drizzle ORM database initialization for CODA
// Uses PostgreSQL in production (DATABASE_URL), SQLite locally



import { eq, and, inArray, isNull, desc } from 'drizzle-orm';
import * as schema from '@coda/db/schema';
// Re-export tables and helper schemas for consumption by other modules
export const {
  users,
  accounts,
  balances,
  bankConnections,
  transactions,
  creditScores,
  insuranceRisks,
  financialGoals,
  financialProducts,
  expenses,
  billSplits,
  billSplitParticipants,
  notifications,
  insertAccountSchema,
  insertBankConnectionSchema,
  insertFinancialGoalSchema,
  insertExpenseSchema
} = schema as any;
import postgres from 'postgres';
import Database from 'better-sqlite3';

let db: any;
let dialect: 'postgres' | 'sqlite';

const dbUrl = process.env.DATABASE_URL;
if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
  // Production: PostgreSQL (explicit postgres URL)
  const client = postgres(dbUrl, { max: 1 });
  const drizzleModule: any = await import('drizzle-orm');
  const drizzleFn = drizzleModule.drizzle ?? drizzleModule.default ?? drizzleModule;
  db = drizzleFn(client, { schema });
  dialect = 'postgres';
} else {
  // Local: reuse the package's SQLite-based DB instance (or local file path)
  const pkg = await import('@coda/db');
  db = pkg.db;
  dialect = 'sqlite';
}

// Export only db, dialect, and all tables from schema
export { db, dialect, eq, and, inArray, isNull, desc };
export * from '@coda/db/schema';

export function checkDatabaseConnection(): boolean {
  return !!db;
}