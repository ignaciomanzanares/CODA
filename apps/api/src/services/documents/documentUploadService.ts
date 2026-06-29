/**
 * Servicio de carga de documentos: orquesta análisis PDF, validación de usuario y actualización de scores.
 * Sincronizado con userId real (Render DB). Valida RUT/nombre cuando esté disponible en perfil.
 */

import { randomUUID } from 'crypto';
import { getSfaScoringEngine } from '../scoring/index.js';
import { storage } from '../../storage.js';
import { logger } from '../../logger.js';
import {
  extractPdfText,
  cartolaToSfaTransactions,
  cartolaToSfaProductos,
  type CartolaExtraida,
} from './pdfAnalysis.js';
import { parseCmfPdfBuffer, type CMFParseResult } from '../../parsers/cmf-parser.js';
import { parseCartolaBuffer, ParseError } from '../../parsers/index.js';
import { categorizeTransaction } from '../../parsers/cartola-parser.js';
import { isInternalTransferTx } from '../assistantContext.js';
import { type DetectionTier } from '../../parsers/base.js';
import { logCreditScorePrediction } from '../audit/algorithmicTraceability.js';
import { deleteRelatedScoreDocsForDocumentUpload } from './documentUploadLinks.js';

export const CREDIT_SCORE_EXCELLENT = 680;
export const CREDIT_SCORE_MAX = 850;

/** Métricas SFA opcionales (cartolas): liquidez y estabilidad de ingresos. */
export interface UploadResultMetrics {
  averageMonthlyBalanceClp?: number;
  monthsWithAbonos?: number;
  monthsWithGap?: number;
  overdraftUsageRatio?: number;
  hasOptimizationOpportunity?: boolean;
}

export interface UploadResult {
  step: 'reading' | 'extracting' | 'scoring' | 'done';
  documentType?: 'cmf_informe_deudas' | 'cartola';
  cmf?: CMFParseResult;
  transactionalScore?: number;
  creditScore?: number;
  mainInsights?: string[];
  recommendedProducts?: string[];
  metrics?: UploadResultMetrics;
  /** Tier de detección del banco (solo para cartolas) */
  detection_tier?: DetectionTier;
  /** Confianza de detección del banco (0–1, solo para cartolas) */
  banco_confidence?: number;
  /** Nombre del banco detectado */
  detected_banco?: string;
  /** Cantidad de movimientos extraídos de la cartola (para feedback de revisión en la UI) */
  movementCount?: number;
  /** Id de la importación creada (document_uploads.id), para linkear la revisión en la UI. */
  documentId?: string;
  /** Estado de revisión de la importación: 'not_required' | 'required' | 'reviewed'. */
  reviewStatus?: string;
  /** Razón interna de revisión ('generic_parser' | 'low_confidence'), null si no aplica. */
  reviewReason?: string | null;
  error?: string;
}

/**
 * Deriva el estado de revisión de una importación de cartola a partir de la metadata del parser.
 * `required` cuando el banco no se reconoció directamente (parser genérico) o la detección no fue
 * de alta confianza; si no, `not_required`. CMF no usa este flujo (queda `not_required`).
 */
export function deriveDocumentReviewState(opts: {
  banco?: string | null;
  detectionTier?: DetectionTier | string | null;
}): { reviewStatus: 'not_required' | 'required'; reviewReason: string | null } {
  if (opts.banco === 'Genérico') {
    return { reviewStatus: 'required', reviewReason: 'generic_parser' };
  }
  if (opts.detectionTier != null && opts.detectionTier !== 'HIGH') {
    return { reviewStatus: 'required', reviewReason: 'low_confidence' };
  }
  return { reviewStatus: 'not_required', reviewReason: null };
}

/**
 * Valida que el RUT del documento coincida con el usuario (si tenemos RUT en perfil).
 * Por ahora solo comprobamos que hay userId; se puede extender con user.rut o userMetadata.
 */
export function validateDocumentBelongsToUser(
  _userId: string,
  _rutDocumento?: string | null
): { valid: boolean; message?: string } {
  // TODO: cuando tengamos RUT en users o userMetadata, comparar con rutDocumento
  return { valid: true };
}

/**
 * Procesa buffer de PDF: detecta tipo, extrae datos, actualiza scores y persiste.
 *
 * Unified pipeline — every upload writes to BOTH tables (documentUploads for
 * movements/gastos, scoreDocumentUploads for score computation). Duplicate
 * cartolas (same banco + period) are detected and replaced, not duplicated.
 *
 * Credit score is ONLY computed/shown for CMF Informe de Deudas uploads.
 * Transactional score is computed for every cartola upload.
 */
export async function processDocumentUpload(
  userId: string,
  buffer: Buffer,
): Promise<UploadResult> {
  // 1. Try CMF path first — parseCmfPdfBuffer handles its own text extraction
  try {
    const cmfDoc = await parseCmfPdfBuffer(buffer);
    const validation = validateDocumentBelongsToUser(userId, cmfDoc.rut ?? undefined);
    if (!validation.valid) {
      return { step: 'done', error: validation.message ?? 'El documento no corresponde al usuario.' };
    }
    return processCmfUpload(userId, cmfDoc);
  } catch {
    // Not a CMF document (no RUT, no dates, or can't extract text) — fall through to cartola path
  }

  // 2. Cartola path: hardened pipeline (format detection + tier + reconciliation in one pass)
  try {
    const parsed = await parseCartolaBuffer(buffer);

    // Convert ParseResult → CartolaExtraida for SFA scoring aggregation with previous uploads
    const cartolaExtraida: CartolaExtraida = {
      tipo: 'cartola',
      transacciones: parsed.transacciones.map((tx) => {
        // Transferencia interna (pago de tarjeta / divisas / fondeo a T. Crédito):
        // se PERSISTE como tal — y se conserva el flag es_transferencia que ya
        // marcó el adaptador de tarjeta — para que NO se cuente como ingreso ni
        // gasto (antes el categorizador legacy la marcaba 'ingreso_principal').
        // Terceros ("Transf a <persona>") NO entran aquí: se siguen contando.
        const interna = isInternalTransferTx({
          descripcion: tx.descripcion,
          categoria: tx.categoria,
          es_transferencia: tx.es_transferencia,
        });
        return {
          fecha: tx.fecha instanceof Date ? tx.fecha.toISOString().slice(0, 10) : String(tx.fecha),
          descripcion: tx.descripcion,
          cargo: tx.tipo === 'cargo' ? tx.monto : 0,
          abono: tx.tipo === 'abono' ? tx.monto : 0,
          saldo: tx.saldo_despues,
          categoria: interna ? 'Transferencia interna' : categorizeTransaction(tx.descripcion, tx.monto, tx.tipo),
          es_transferencia: interna || tx.es_transferencia === true,
          ...(tx.montoUsd != null ? { montoUsd: tx.montoUsd } : {}),
          ...(tx.fxRate != null ? { fxRate: tx.fxRate } : {}),
        };
      }),
      saldoInicial: parsed.saldo_inicial,
      saldoFinal: parsed.saldo_final,
      rutDocumento: undefined,
    };

    const banco = parsed.banco ?? null;
    const periodoDesde = parsed.periodo?.desde instanceof Date ? parsed.periodo.desde.toISOString().slice(0, 10) : null;
    const periodoHasta = parsed.periodo?.hasta instanceof Date ? parsed.periodo.hasta.toISOString().slice(0, 10) : null;

    // ── Duplicate detection: if same banco + period already exists, replace it ──
    let duplicateReplaced = false;
    if (banco && periodoDesde) {
      const existing = await storage.listDocumentUploadsByType(userId, "cartola");
      const dup = existing.find(
        (r) => r.banco === banco && r.periodoDesde === periodoDesde && r.periodoHasta === periodoHasta
      );
      if (dup) {
        await deleteRelatedScoreDocsForDocumentUpload(userId, dup);
        await storage.deleteDocumentUploadById(dup.id, userId);
        duplicateReplaced = true;
        logger.info({ userId, banco, periodoDesde, periodoHasta }, '[documentUploadService] Cartola duplicada reemplazada en documentUploads');
      }

      if (!dup) {
        const existingScore = await storage.listScoreDocumentUploadsByType(userId, "cartola");
        const legacyMatches = existingScore.filter(
          (r) => !r.sourceDocumentUploadId && r.banco === banco && r.periodoDesde === periodoDesde && r.periodoHasta === periodoHasta
        );
        if (legacyMatches.length === 1) {
          const { deleteTransactionsForDocument } = await import('./normalizeCartola.js');
          await deleteTransactionsForDocument(userId, legacyMatches[0].id).catch(() => {});
          await storage.deleteScoreDocumentUploadById(legacyMatches[0].id, userId);
          logger.info({ userId, banco, periodoDesde, periodoHasta }, '[documentUploadService] Cartola legacy duplicada reemplazada en scoreDocumentUploads');
        } else if (legacyMatches.length > 1) {
          logger.warn({ userId, banco, periodoDesde, periodoHasta, count: legacyMatches.length }, '[documentUploadService] scoreDocumentUploads legacy ambiguos; no se borran por heurística');
        }
      }
    }

    const baseRow = {
      userId,
      tipo: "cartola" as const,
      banco,
      periodoDesde,
      periodoHasta,
      parsedData: cartolaExtraida,
      parseStatus: "success" as const,
    };

    const review = deriveDocumentReviewState({ banco, detectionTier: parsed.detection_tier });

    // Write to BOTH tables (el score doc referencia explicitamente al document upload).
    const documentUploadId = randomUUID();
    const scoreDocId = randomUUID();
    await Promise.all([
      storage.createDocumentUpload({
        ...baseRow,
        id: documentUploadId,
        normalizationStatus: "pending",
        reviewStatus: review.reviewStatus,
        reviewReason: review.reviewReason,
      }),
      storage.createScoreDocumentUpload({ ...baseRow, id: scoreDocId, sourceDocumentUploadId: documentUploadId }),
    ]);

    // Normalizar a accounts/transactions (fuente de verdad para Movimientos y el
    // split bruto/real). Si falla, NO dejamos un upload "success" con Movimientos
    // vacío: el documento queda marcado failed y el score doc se elimina.
    try {
      const { normalizeCartolaDoc } = await import('./normalizeCartola.js');
      const normalized = await normalizeCartolaDoc({
        userId,
        documentId: scoreDocId,
        banco,
        periodoDesde,
        periodoHasta,
        transacciones: (cartolaExtraida.transacciones ?? []) as never,
      });
      if (!normalized || normalized.inserted === 0) {
        throw new Error('No se insertaron transacciones normalizadas para la cartola.');
      }
      await storage.updateDocumentUploadNormalizationStatus(documentUploadId, userId, "success");
    } catch (e) {
      await storage.updateDocumentUploadNormalizationStatus(documentUploadId, userId, "failed").catch(() => {});
      await storage.deleteScoreDocumentUploadById(scoreDocId, userId).catch(() => {});
      logger.warn({ err: e, userId, documentUploadId, scoreDocId }, '[documentUploadService] normalizeCartola falló');
      return {
        step: 'done',
        documentType: 'cartola',
        error: 'La cartola se leyó, pero no pudimos normalizar sus movimientos. El documento quedó marcado para revisión; elimínalo y vuelve a subirlo.',
        detection_tier: parsed.detection_tier,
        banco_confidence: parsed.banco_confidence,
        detected_banco: parsed.banco,
      };
    }

    // ── Compute transactional score from ALL score cartolas ──
    const rut = cartolaExtraida.rutDocumento ?? '00.000.000-0';
    const allScoreCartolas = await storage.listScoreDocumentUploadsByType(userId, "cartola");
    const allParsed: CartolaExtraida[] = allScoreCartolas
      .map((r) => r?.parsedData as CartolaExtraida | null)
      .filter((c): c is CartolaExtraida => !!c && Array.isArray(c.transacciones));
    const transactions = allParsed.flatMap((c) => cartolaToSfaTransactions(c, c.rutDocumento ?? rut));
    const products = allParsed.flatMap((c) => cartolaToSfaProductos(c, c.rutDocumento ?? rut));

    const engine = getSfaScoringEngine();
    const scoreResult = engine.run({ transactions, products });

    const hasInterest = parsed.transacciones.some(
      (t) => /interés|interes|intereses|línea|linea|crédito|credito|tarjeta/i.test(t.descripcion)
    );
    const mainInsights = [...scoreResult.mainInsights];
    if (hasInterest) {
      mainInsights.push(
        'Detectamos intereses de línea de crédito o tarjeta en tu cartola. Te recomendamos consolidar deudas y evaluar ofertas de ahorro según el Business Plan.'
      );
    }
    if (parsed.warnings && parsed.warnings.length > 0) {
      mainInsights.push(...parsed.warnings);
    }
    if (duplicateReplaced) {
      mainInsights.push(
        'Esta cartola ya había sido subida previamente (mismo banco y período). Los datos anteriores fueron reemplazados.'
      );
    }

    await storage.upsertTransactionalScore(userId, {
      transactionalScore: scoreResult.transactionalScore,
      metrics: scoreResult.metrics,
      mainInsights,
      recommendedProducts: scoreResult.recommendedProducts,
      algorithmInputs: {
        pipeline: 'cartola_pdf_hardened',
        transactionCount: transactions.length,
        productCount: products.length,
        cartolasCount: allParsed.length,
        banco_confidence: parsed.banco_confidence,
        detection_tier: parsed.detection_tier,
        parse_confidence: parsed.parse_confidence,
      },
    });
    return {
      step: 'done',
      documentType: 'cartola',
      transactionalScore: scoreResult.transactionalScore,
      mainInsights,
      recommendedProducts: scoreResult.recommendedProducts,
      metrics: scoreResult.metrics,
      detection_tier: parsed.detection_tier,
      banco_confidence: parsed.banco_confidence,
      detected_banco: parsed.banco,
      movementCount: parsed.transacciones.length,
      documentId: documentUploadId,
      reviewStatus: review.reviewStatus,
      reviewReason: review.reviewReason,
    };
  } catch (e) {
    if (e instanceof ParseError) {
      return { step: 'done', error: `${e.messageEs}` };
    }
    throw e;
  }
}

async function processCmfUpload(userId: string, doc: CMFParseResult): Promise<UploadResult> {
    const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dKk]\b/;
    const rutExtraido = doc.rut?.trim();
    const rutValido = rutExtraido && RUT_RE.test(rutExtraido);
    if (!rutValido) {
      return {
        step: 'done',
        error: 'No se encontró un RUT válido en el Informe CMF. Verifica que el PDF sea un informe de deudas oficial.',
      };
    }

    const numInstituciones = doc.deuda_directa.length;
    const cmfInsight =
      doc.deuda_total === 0
        ? 'Perfil Crediticio Saludable: Sin deudas morosas. Estado vigente según Informe CMF.'
        : numInstituciones > 0
          ? `Deuda total vigente: $${doc.deuda_total.toLocaleString('es-CL')} CLP en ${numInstituciones} institución(es).`
          : 'Sin deudas vigentes reportadas en el informe CMF.';

    const cmfRow = {
      userId,
      tipo: "cmf" as const,
      banco: null,
      periodoDesde: null,
      periodoHasta: null,
      parsedData: doc,
      parseStatus: "success" as const,
    };

    // Write to BOTH tables
    await Promise.all([
      storage.createDocumentUpload({ ...cmfRow, id: randomUUID() }),
      storage.createScoreDocumentUpload({ ...cmfRow, id: randomUUID() }),
    ]);

    // Compute and persist credit score
    const startTime = Date.now();
    const requestId = randomUUID();
    const creditScoreValue = computeCreditScoreFromCmf(doc);
    const scoreNum = Number(creditScoreValue);
    const riskCategory = scoreNum >= 750 ? 'EXCELLENT'
      : scoreNum >= 680 ? 'GOOD'
      : scoreNum >= 620 ? 'AVERAGE'
      : scoreNum >= 550 ? 'POOR'
      : 'VERY_POOR';
    const pd = Math.max(0, Math.min(1, (850 - scoreNum) / 550));

    const predictionLogId = logCreditScorePrediction(
      userId,
      requestId,
      {
        creditScore: scoreNum,
        probabilityDefault: pd,
        riskCategory,
        confidence: 0.85,
        topFactors: [
          {
            name: 'Deuda Total Vigente',
            value: doc.deuda_total,
            impact: doc.deuda_total === 0 ? 100 : -50,
            explanation: doc.deuda_total === 0
              ? 'Sin deudas vigentes (excelente)'
              : `Deuda de $${doc.deuda_total.toLocaleString('es-CL')} CLP`,
          },
          {
            name: 'Deuda Indirecta',
            value: doc.deuda_indirecta.reduce((s, d) => s + d.total, 0),
            impact: doc.deuda_indirecta.length === 0 ? 50 : -30,
            explanation: doc.deuda_indirecta.length === 0
              ? 'Sin deudas indirectas (excelente)'
              : `Deuda indirecta de $${doc.deuda_indirecta.reduce((s, d) => s + d.total, 0).toLocaleString('es-CL')} CLP`,
          },
          {
            name: 'Número de Instituciones',
            value: doc.deuda_directa.length,
            impact: doc.deuda_directa.length === 0 ? 30 : -20,
            explanation: `${doc.deuda_directa.length} institución(es) reportada(s)`,
          },
        ],
      },
      {
        cmfData: doc as any,
        features: {
          deudaTotalVigente: doc.deuda_total,
          deudaIndirecta: doc.deuda_indirecta.reduce((s, d) => s + d.total, 0),
          numeroInstituciones: doc.deuda_directa.length,
          hasDebt: doc.deuda_total > 0,
          debtRatio: doc.deuda_total > 0
            ? doc.deuda_indirecta.reduce((s, d) => s + d.total, 0) / doc.deuda_total
            : 0,
        },
      },
      { processingTimeMs: Date.now() - startTime }
    );

    logger.info({ userId, requestId, predictionLogId, score: scoreNum }, '[documentUploadService] CMF: prediction logged');

    const creditPayload = {
      score: scoreNum,
      maxScore: CREDIT_SCORE_MAX,
      paymentHistory: 'Excellent',
      utilization: 'Good',
      ageOfCredit: 'Good',
      lastUpdated: new Date().toISOString(),
    };
    logger.info({ userId, creditPayload }, '[documentUploadService] CMF: upsertCreditScore');
    await storage.upsertCreditScore(userId, creditPayload);

    const afterSave = await storage.getCreditScore(userId);
    if (!afterSave) {
      logger.error({ userId }, '[documentUploadService] CMF: getCreditScore returned nothing after upsert');
      throw new Error('Credit score no persistido en base de datos. Reintenta más tarde.');
    }
    const scoreEnDb = Number(afterSave.score);
    if (scoreEnDb !== scoreNum) {
      logger.error({ userId, esperado: scoreNum, enDb: scoreEnDb }, '[documentUploadService] CMF: score mismatch');
      throw new Error(`Credit score persistido no coincide (esperado ${scoreNum}, en DB ${scoreEnDb}). Reintenta más tarde.`);
    }
    logger.info({ userId, score: scoreEnDb }, '[documentUploadService] CMF: DB confirmed OK');

    return {
      step: 'done',
      documentType: 'cmf_informe_deudas',
      cmf: doc,
      creditScore: scoreNum,
      mainInsights: [cmfInsight],
    };
}

/**
 * Score crediticio a partir del Informe CMF (usa metricas.score_cmf 0-100 → escala 300-850).
 */
function computeCreditScoreFromCmf(cmf: CMFParseResult): number {
  const raw = Math.round(300 + cmf.metricas.score_cmf * 5.5);
  return Math.max(300, Math.min(CREDIT_SCORE_MAX, raw));
}
