/**
 * Persistencia de trazabilidad algorítmica en la misma BD que el resto de CODA
 * (Postgres en producción, SQLite en local). Complementa el almacén en memoria
 * de algorithmicTraceability.ts para auditoría CMF / NCG 502.
 */

import { randomUUID } from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { db, algorithmModelVersions, algorithmPredictionLogs } from '../../db/index.js';
import { logger } from '../../logger.js';
import { encryptField, decryptField, looksEncrypted } from '../crypto/fieldEncryption.js';

/** Evita import circular con algorithmicTraceability.ts */
export interface PersistableCreditPredictionLog {
  id: string;
  userId: string;
  requestId: string;
  modelVersionId: string;
  modelVersion: string;
  modelType: string;
  inputFeatures: Record<string, unknown>;
  creditScore: number;
  probabilityDefault: number;
  riskCategory: string;
  confidence: number;
  cmfData?: unknown;
  sfaData?: unknown;
  topFactors?: unknown;
  processingTimeMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface SeedCreditModel {
  id: string;
  modelType: string;
  version: string;
  changelog?: string | null;
}

/** Misma versión por defecto que TraceabilityStore (algorithmicTraceability.ts). */
export const DEFAULT_CREDIT_MODEL_VERSION_ID = 'a0000001-0000-4000-8000-000000000001';

/** IDs estables para modelos que no pasan por el registro en memoria. */
export const TRACEABILITY_SEED_MODELS = {
  transactionalSfa: {
    id: 'a0000002-0000-4000-8000-000000000001',
    modelType: 'sfa_transactional',
    version: 'v1.0.0',
  },
  productMatching: {
    id: 'a0000003-0000-4000-8000-000000000001',
    modelType: 'product_matching',
    version: 'v1.0.0',
  },
  financialHealthV2: {
    id: 'a0000004-0000-4000-8000-000000000001',
    modelType: 'financial_health_v2',
    version: 'v2.0.0',
  },
} as const;

const MAX_JSON = 400_000;

/** Serializa y cifra (pseudonimización de columna — `algorithm_prediction_logs` guarda PII/datos financieros). */
function safeJson(value: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(value);
    if (s.length > MAX_JSON) s = `${s.slice(0, MAX_JSON)}…[truncated]`;
  } catch {
    s = '{"error":"serialization_failed"}';
  }
  return encryptField(s);
}

async function ensureModelVersionRow(
  row: {
    id: string;
    modelType: string;
    version: string;
    deployedBy?: string;
    changelog?: string | null;
  },
  exec: any = db,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await exec
      .insert(algorithmModelVersions)
      .values({
        id: row.id,
        modelType: row.modelType,
        version: row.version,
        deployedAt: now,
        deployedBy: row.deployedBy ?? 'system',
        isActive: 1,
        changelog: row.changelog ?? 'seed',
        createdAt: now,
      })
      .onConflictDoNothing();
  } catch (e) {
    logger.warn({ err: e, id: row.id }, 'traceability: ensureModelVersionRow failed (non-fatal)');
  }
}

/**
 * Inserta versiones fijas (score transaccional, matching de productos) y opcionalmente
 * la versión activa de score CMF desde memoria.
 */
export async function ensureSeedTraceabilityModels(activeCreditModel?: SeedCreditModel): Promise<void> {
  await ensureModelVersionRow({
    id: DEFAULT_CREDIT_MODEL_VERSION_ID,
    modelType: 'simple_rules',
    version: 'v1.0.0',
    changelog: 'Initial simple rule-based credit scoring (CMF-only)',
  });
  await ensureModelVersionRow({
    id: TRACEABILITY_SEED_MODELS.transactionalSfa.id,
    modelType: TRACEABILITY_SEED_MODELS.transactionalSfa.modelType,
    version: TRACEABILITY_SEED_MODELS.transactionalSfa.version,
    changelog: 'SFA transactional scoring engine (cartola)',
  });
  await ensureModelVersionRow({
    id: TRACEABILITY_SEED_MODELS.productMatching.id,
    modelType: TRACEABILITY_SEED_MODELS.productMatching.modelType,
    version: TRACEABILITY_SEED_MODELS.productMatching.version,
    changelog: 'Weighted product matching (matchingEngine)',
  });
  await ensureModelVersionRow({
    id: TRACEABILITY_SEED_MODELS.financialHealthV2.id,
    modelType: TRACEABILITY_SEED_MODELS.financialHealthV2.modelType,
    version: TRACEABILITY_SEED_MODELS.financialHealthV2.version,
    changelog: 'Motor Evaluación Salud Financiera v2 — 8 niveles, Etapa 1 determinística + Etapa 2 score compuesto',
  });
  if (activeCreditModel) {
    await ensureModelVersionRow({
      id: activeCreditModel.id,
      modelType: activeCreditModel.modelType,
      version: activeCreditModel.version,
      changelog: activeCreditModel.changelog ?? null,
    });
  }
}

export async function persistCreditPredictionFromLog(
  log: PersistableCreditPredictionLog,
  exec: any = db,
): Promise<void> {
  await ensureModelVersionRow(
    {
      id: log.modelVersionId,
      modelType: log.modelType,
      version: log.modelVersion,
      changelog: 'credit CMF from document',
    },
    exec,
  );

  await exec.insert(algorithmPredictionLogs).values({
    id: log.id,
    userId: log.userId,
    requestId: log.requestId,
    kind: 'credit_cmf',
    modelVersionId: log.modelVersionId,
    modelVersion: log.modelVersion,
    modelType: log.modelType,
    inputFeatures: safeJson(log.inputFeatures),
    outputSnapshot: safeJson({
      creditScore: log.creditScore,
      probabilityDefault: log.probabilityDefault,
      riskCategory: log.riskCategory,
      confidence: log.confidence,
    }),
    cmfData: log.cmfData ? safeJson(log.cmfData) : null,
    sfaData: log.sfaData ? safeJson(log.sfaData) : null,
    topFactors: log.topFactors ? safeJson(log.topFactors) : null,
    processingTimeMs: log.processingTimeMs ?? null,
    ipAddress: log.ipAddress ?? null,
    userAgent: log.userAgent ?? null,
  });
}

export async function logTransactionalScoreComputation(params: {
  userId: string;
  requestId: string;
  input: Record<string, unknown>;
  output: {
    transactionalScore: number;
    mainInsights: string[];
    recommendedProducts?: string[];
    metrics?: unknown;
  };
  processingTimeMs?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}, exec: any = db): Promise<void> {
  const m = TRACEABILITY_SEED_MODELS.transactionalSfa;
  await ensureModelVersionRow({
    id: m.id,
    modelType: m.modelType,
    version: m.version,
  }, exec);

  const id = randomUUID();
  await exec.insert(algorithmPredictionLogs).values({
    id,
    userId: params.userId,
    requestId: params.requestId,
    kind: 'transactional_sfa',
    modelVersionId: m.id,
    modelVersion: m.version,
    modelType: m.modelType,
    inputFeatures: safeJson(params.input),
    outputSnapshot: safeJson(params.output),
    cmfData: null,
    sfaData: null,
    topFactors: null,
    processingTimeMs: params.processingTimeMs ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}

export async function logProductRecommendationRun(params: {
  userId: string;
  requestId: string;
  userProfile: Record<string, unknown>;
  category?: string;
  limit: number;
  results: Array<{
    productId: number;
    name?: string;
    matchScore: number;
    rankingScore: number;
  }>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const m = TRACEABILITY_SEED_MODELS.productMatching;
  await ensureModelVersionRow({
    id: m.id,
    modelType: m.modelType,
    version: m.version,
  });

  const id = randomUUID();
  await db.insert(algorithmPredictionLogs).values({
    id,
    userId: params.userId,
    requestId: params.requestId,
    kind: 'product_recommendation',
    modelVersionId: m.id,
    modelVersion: m.version,
    modelType: m.modelType,
    inputFeatures: safeJson({
      userProfile: params.userProfile,
      category: params.category ?? null,
      limit: params.limit,
    }),
    outputSnapshot: safeJson({ results: params.results }),
    cmfData: null,
    sfaData: null,
    topFactors: null,
    processingTimeMs: null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}

/**
 * Eventos posteriores a la recomendación (vista, clic, etc.) — mismo motor de matching versionado.
 */
export async function logProductInteractionTrace(params: {
  userId: string;
  requestId: string;
  productId: number;
  eventType: string;
  matchScore?: number;
  userCreditScore?: number;
  userTransactionalScore?: number;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const m = TRACEABILITY_SEED_MODELS.productMatching;
  await ensureModelVersionRow({
    id: m.id,
    modelType: m.modelType,
    version: m.version,
  });

  const id = randomUUID();
  await db.insert(algorithmPredictionLogs).values({
    id,
    userId: params.userId,
    requestId: params.requestId,
    kind: 'product_interaction',
    modelVersionId: m.id,
    modelVersion: m.version,
    modelType: m.modelType,
    inputFeatures: safeJson({
      productId: params.productId,
      eventType: params.eventType,
      matchScore: params.matchScore ?? null,
      userCreditScore: params.userCreditScore ?? null,
      userTransactionalScore: params.userTransactionalScore ?? null,
      metadata: params.metadata ?? null,
    }),
    outputSnapshot: safeJson({ recorded: true, at: new Date().toISOString() }),
    cmfData: null,
    sfaData: null,
    topFactors: null,
    processingTimeMs: null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}

/** Solicitud formal de producto (post-recomendación). */
export async function logProductApplicationTrace(params: {
  userId: string;
  requestId: string;
  productId: number;
  applicationId: number;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const m = TRACEABILITY_SEED_MODELS.productMatching;
  await ensureModelVersionRow({
    id: m.id,
    modelType: m.modelType,
    version: m.version,
  });

  const id = randomUUID();
  await db.insert(algorithmPredictionLogs).values({
    id,
    userId: params.userId,
    requestId: params.requestId,
    kind: 'product_application',
    modelVersionId: m.id,
    modelVersion: m.version,
    modelType: m.modelType,
    inputFeatures: safeJson({
      productId: params.productId,
      applicationId: params.applicationId,
      ...params.payload,
    }),
    outputSnapshot: safeJson({ status: 'submitted', at: new Date().toISOString() }),
    cmfData: null,
    sfaData: null,
    topFactors: null,
    processingTimeMs: null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}

/** Descifra (si corresponde) y parsea el JSON guardado vía `safeJson`. */
function safeParseJsonRecord(s: string): Record<string, unknown> | null {
  try {
    const decrypted = looksEncrypted(s) ? decryptField(s) : s;
    const v = JSON.parse(decrypted) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Persiste una evaluación del motor de salud financiera v2 (NCG 502). */
export async function logFinancialHealthV2(params: {
  userId: string;
  requestId: string;
  input: {
    deudaFlujo: number;
    deudaActivos: number;
    ahorroIngreso: number;
    moraActiva: boolean;
    diasMora: number;
  };
  output: {
    nivel: number;
    nivelNombre: string;
    salida: string;
    zona: string;
    scoreCompuesto: number;
    scoreRatios: number;
    scoreInterno: number;
    nivelBruto: number;
  };
  processingTimeMs?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const m = TRACEABILITY_SEED_MODELS.financialHealthV2;
  await ensureModelVersionRow({
    id: m.id,
    modelType: m.modelType,
    version: m.version,
  });

  const id = randomUUID();
  await db.insert(algorithmPredictionLogs).values({
    id,
    userId: params.userId,
    requestId: params.requestId,
    kind: 'financial_health_v2',
    modelVersionId: m.id,
    modelVersion: m.version,
    modelType: m.modelType,
    inputFeatures: safeJson(params.input),
    outputSnapshot: safeJson(params.output),
    cmfData: null,
    sfaData: null,
    topFactors: null,
    processingTimeMs: params.processingTimeMs ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}


/** Entrada legible para el usuario (sin PII extra); el JSON completo sigue en BD. */
export interface AlgorithmPredictionLogRow {
  id: string;
  requestId: string;
  kind: string;
  modelVersion: string;
  modelType: string;
  createdAt: string;
  inputSummary: Record<string, unknown> | null;
  outputSummary: Record<string, unknown> | null;
}

/**
 * Historial persistido en `algorithm_prediction_logs` (complementa la memoria de credit CMF).
 */
export async function listAlgorithmPredictionLogsForUser(
  userId: string,
  limit = 50
): Promise<AlgorithmPredictionLogRow[]> {
  const cap = Math.min(Math.max(limit, 1), 100);
  const rows = await db
    .select({
      id: algorithmPredictionLogs.id,
      requestId: algorithmPredictionLogs.requestId,
      kind: algorithmPredictionLogs.kind,
      modelVersion: algorithmPredictionLogs.modelVersion,
      modelType: algorithmPredictionLogs.modelType,
      inputFeatures: algorithmPredictionLogs.inputFeatures,
      outputSnapshot: algorithmPredictionLogs.outputSnapshot,
      createdAt: algorithmPredictionLogs.createdAt,
    })
    .from(algorithmPredictionLogs)
    .where(eq(algorithmPredictionLogs.userId, userId))
    .orderBy(desc(algorithmPredictionLogs.createdAt))
    .limit(cap);

  return rows.map(
    (r: {
      id: string;
      requestId: string;
      kind: string;
      modelVersion: string;
      modelType: string;
      inputFeatures: string;
      outputSnapshot: string;
      createdAt: string | null;
    }) => ({
      id: r.id,
      requestId: r.requestId,
      kind: r.kind,
      modelVersion: r.modelVersion,
      modelType: r.modelType,
      createdAt: r.createdAt ?? '',
      inputSummary: safeParseJsonRecord(r.inputFeatures),
      outputSummary: safeParseJsonRecord(r.outputSnapshot),
    })
  );
}
