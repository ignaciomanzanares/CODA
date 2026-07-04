// Centralized Drizzle ORM database initialization for CODA
// Uses PostgreSQL in production (DATABASE_URL), SQLite locally



import { eq, and, inArray, isNull, isNotNull, lt, desc, sql } from 'drizzle-orm';
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
  documentUploads,
  scoreDocumentUploads,
  documentOriginals,
  documentParseOutcomes,
  transactionCategoryCorrections,
  habitRecommendationsLog,
  productRankingWeights,
  userScores,
  creditScoreHistory,
  riskFactors,
  goalProgress,
  productRecommendations,
  insertAccountSchema,
  insertBankConnectionSchema,
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
  userAssets,
  inscripcionJobs,
  auditLogs,
  assistantFeedback,
  assistantSummaries,
  habitFeedback,
  storedBlobs,
  indicatorValues,
  productConversionEvents,
  parserDiagnostics,
} = schema as any;
import postgres from 'postgres';
import { ensurePostgresSslMode } from './postgresUrl.js';

let db: any;
let dialect: 'postgres' | 'sqlite';

const rawDbUrl = process.env.DATABASE_URL;
const dbUrl =
  rawDbUrl && (rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://'))
    ? ensurePostgresSslMode(rawDbUrl)
    : rawDbUrl;
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

/**
 * Transacción dialect-aware (#14). En Postgres envuelve `fn` en una transacción
 * real: si cualquier escritura falla, se revierten todas (atomicidad). En SQLite
 * (better-sqlite3) el driver exige un callback **síncrono** y nuestras escrituras
 * son async (`await db.insert(...)`), así que no existe transacción nativa
 * compatible: las operaciones corren secuencialmente sobre `db` —mismo
 * comportamiento que antes—. SQLite es solo dev/test; la garantía de atomicidad
 * aplica en producción (Postgres).
 *
 * `fn` recibe un "executor" (`tx` en Postgres, `db` en SQLite) que expone la
 * misma API de Drizzle (`.insert()`, `.execute()`, …); pásalo a cada escritura
 * que deba compartir la transacción.
 */
async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  if (dialect === 'postgres') {
    return db.transaction(fn);
  }
  return fn(db);
}

// Export only db, dialect, and all tables from schema
export { db, dialect, withTransaction, eq, and, inArray, isNull, isNotNull, lt, desc, sql };
export * from '@coda/db/schema';

export function checkDatabaseConnection(): boolean {
  return !!db;
}