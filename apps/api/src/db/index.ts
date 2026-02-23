// Centralized Drizzle ORM database initialization for CODA
// Uses PostgreSQL in production (DATABASE_URL), SQLite locally



import { eq, and, inArray, isNull, desc, sql } from 'drizzle-orm';
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
  consentGrants,
  insertAccountSchema,
  insertBankConnectionSchema,
  insertFinancialGoalSchema,
  insertExpenseSchema,
  // CODA Empresas (misma BD)
  empresasCompanies,
  empresasUsers,
  empresasMemberships,
  empresasAuditLogs,
  empresasBankAccounts,
  empresasBankTransactions,
  empresasBankBalances,
  empresasDteDocuments,
  empresasPurchaseOrders,
  empresasReconciliationMatches,
  empresasReconciliationRules,
  empresasChartOfAccounts,
  empresasVendorCategoryMappings,
  empresasAccountingPeriods,
  empresasJournalEntries,
  empresasJournalLines,
  empresasRiskScores,
  empresasRiskFactors,
} = schema as any;
import postgres from 'postgres';

let db: any;
let dialect: 'postgres' | 'sqlite';

const dbUrl = process.env.DATABASE_URL;
// In production, DATABASE_URL must be set. Fail early with a clear message instead
if (process.env.NODE_ENV === 'production' && !dbUrl) {
  throw new Error('DATABASE_URL is required in production. Set the DATABASE_URL environment variable to your Postgres connection string.');
}
if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
  // Production: PostgreSQL (explicit postgres URL)
  const client = postgres(dbUrl, { max: 1 });
  // Import the postgres-specific drizzle adapter which exports `drizzle`
  const { drizzle: drizzleFn } = await import('drizzle-orm/postgres-js');
  db = drizzleFn(client, { schema });
  dialect = 'postgres';
} else {
  // Local: only import the package's SQLite-based DB instance when DATABASE_URL is absent.
  // This avoids loading sqlite-related modules in production.
    const pkg = await import('@coda/db');
    db = pkg.db;
    dialect = 'sqlite';
}

// Export only db, dialect, and all tables from schema
export { db, dialect, eq, and, inArray, isNull, desc, sql };
export * from '@coda/db/schema';

export function checkDatabaseConnection(): boolean {
  return !!db;
}