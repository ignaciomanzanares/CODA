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
  transactionalScores,
  insuranceRisks,
  financialGoals,
  financialProducts,
  leadTracking,
  productApplications,
  expenses,
  billSplits,
  billSplitParticipants,
  notifications,
  pushSubscriptions,
  consentGrants,
  privacyConsentEvents,
  algorithmModelVersions,
  algorithmPredictionLogs,
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
  // Production: PostgreSQL (Render, etc.). Pool pequeño pero >1 evita colgarse en picos; timeout explícito.
  // Si la BD exige SSL, incluye ?sslmode=require en DATABASE_URL (recomendado en Render).
  const poolMax = Math.min(20, Math.max(2, Number(process.env.PG_POOL_MAX) || 8));
  const client = postgres(dbUrl, {
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: Number(process.env.PG_CONNECT_TIMEOUT_SEC) || 15,
  });
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