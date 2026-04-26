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
  parseCmfInformeDeudas,
  cartolaToSfaTransactions,
  cartolaToSfaProductos,
  type CmfInformeDeudas,
  type CartolaExtraida,
} from './pdfAnalysis.js';
import { parseCartolaBuffer, ParseError } from '../../parsers/index.js';
import { categorizeTransaction } from '../../parsers/cartola-parser.js';
import { type DetectionTier } from '../../parsers/base.js';
import { logCreditScorePrediction } from '../audit/algorithmicTraceability.js';

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
  cmf?: CmfInformeDeudas;
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
  error?: string;
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
 * Pipeline: extract text once → check CMF signals → if not CMF, use hardened
 * parseCartolaBuffer() (format detection + tier + reconciliation in one pass).
 */
export type UploadContext = 'movements' | 'score';

export async function processDocumentUpload(
  userId: string,
  buffer: Buffer,
  context: UploadContext = 'movements',
): Promise<UploadResult> {
  // 1. Extract text once — shared by CMF detection and cartola fallback
  let text = '';
  try {
    const result = await extractPdfText(buffer);
    text = result.text ?? '';
  } catch {
    /* will propagate as error below */
  }

  if (!text || text.trim().length < 40) {
    return {
      step: 'done',
      error: 'No se pudo reconocer el documento. Asegúrate de subir un Informe de Deudas CMF o una Cartola Bancaria en PDF.',
    };
  }

  // 2. CMF path: text-only detection — no second PDF pass needed
  const cmfDoc = parseCmfInformeDeudas(text);
  if (cmfDoc) {
    const validation = validateDocumentBelongsToUser(userId, cmfDoc.rutDocumento ?? undefined);
    if (!validation.valid) {
      return { step: 'done', error: validation.message ?? 'El documento no corresponde al usuario.' };
    }
    return processCmfUpload(userId, cmfDoc, context);
  }

  // 3. Cartola path: hardened pipeline (format detection + tier + reconciliation in one pass)
  try {
    const parsed = await parseCartolaBuffer(buffer);

    // Convert ParseResult → CartolaExtraida for SFA scoring aggregation with previous uploads
    const cartolaExtraida: CartolaExtraida = {
      tipo: 'cartola',
      transacciones: parsed.transacciones.map((tx) => ({
        fecha: tx.fecha instanceof Date ? tx.fecha.toISOString().slice(0, 10) : String(tx.fecha),
        descripcion: tx.descripcion,
        cargo: tx.tipo === 'cargo' ? tx.monto : 0,
        abono: tx.tipo === 'abono' ? tx.monto : 0,
        saldo: tx.saldo_despues,
        categoria: categorizeTransaction(tx.descripcion, tx.monto, tx.tipo),
      })),
      saldoInicial: parsed.saldo_inicial,
      saldoFinal: parsed.saldo_final,
      rutDocumento: undefined,
    };

    const uploadRow = {
      id: randomUUID(),
      userId,
      tipo: "cartola" as const,
      banco: parsed.banco ?? null,
      periodoDesde: parsed.periodo?.desde instanceof Date ? parsed.periodo.desde.toISOString().slice(0, 10) : null,
      periodoHasta: parsed.periodo?.hasta instanceof Date ? parsed.periodo.hasta.toISOString().slice(0, 10) : null,
      parsedData: cartolaExtraida,
      parseStatus: "success" as const,
    };

    if (context === 'movements') {
      // Movements-only: write to documentUploads, NO score computation
      await storage.createDocumentUpload(uploadRow);
      return {
        step: 'done',
        documentType: 'cartola',
        detection_tier: parsed.detection_tier,
        banco_confidence: parsed.banco_confidence,
        detected_banco: parsed.banco,
      };
    }

    // Score context: write to scoreDocumentUploads + compute scores
    await storage.createScoreDocumentUpload(uploadRow);

    const rut = cartolaExtraida.rutDocumento ?? '00.000.000-0';
    const previousCartolas = await storage.listScoreDocumentUploadsByType(userId, "cartola");
    const previousParsed: CartolaExtraida[] = previousCartolas
      .map((r) => r?.parsedData as CartolaExtraida | null)
      .filter((c): c is CartolaExtraida => !!c && Array.isArray(c.transacciones));
    const allCartolas = [...previousParsed, cartolaExtraida];
    const transactions = allCartolas.flatMap((c) => cartolaToSfaTransactions(c, c.rutDocumento ?? rut));
    const products = allCartolas.flatMap((c) => cartolaToSfaProductos(c, c.rutDocumento ?? rut));

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

    await storage.upsertTransactionalScore(userId, {
      transactionalScore: scoreResult.transactionalScore,
      metrics: scoreResult.metrics,
      mainInsights,
      recommendedProducts: scoreResult.recommendedProducts,
      algorithmInputs: {
        pipeline: 'cartola_pdf_hardened',
        transactionCount: transactions.length,
        productCount: products.length,
        cartolasCount: allCartolas.length,
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
    };
  } catch (e) {
    if (e instanceof ParseError) {
      return { step: 'done', error: `${e.messageEs}` };
    }
    throw e;
  }
}

async function processCmfUpload(userId: string, doc: CmfInformeDeudas, context: UploadContext): Promise<UploadResult> {
    const uploadId = randomUUID();
    const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dKk]\b/;
    const rutExtraido = doc.rutDocumento?.trim();
    const rutValido = rutExtraido && RUT_RE.test(rutExtraido);
    if (!rutValido) {
      return {
        step: 'done',
        error: 'No se encontró un RUT válido en el Informe CMF. Verifica que el PDF sea un informe de deudas oficial.',
      };
    }

    const cmfInsight =
      doc.deudaTotalVigente === 0 && doc.deudaIndirecta === 0
        ? 'Perfil Crediticio Saludable: Sin deudas morosas. Estado vigente según Informe CMF.'
        : doc.numeroInstituciones > 0
          ? `Deuda total vigente: $${doc.deudaTotalVigente.toLocaleString('es-CL')} CLP en ${doc.numeroInstituciones} institución(es).`
          : 'Sin deudas vigentes reportadas en el informe CMF.';

    const cmfRow = {
      id: uploadId,
      userId,
      tipo: "cmf" as const,
      banco: null,
      periodoDesde: null,
      periodoHasta: null,
      parsedData: doc,
      parseStatus: "success" as const,
    };

    if (context === 'movements') {
      // Movements-only: write to documentUploads, NO score computation
      await storage.createDocumentUpload(cmfRow);
      return {
        step: 'done',
        documentType: 'cmf_informe_deudas',
        cmf: { ...doc, rutDocumento: doc.rutDocumento ?? undefined },
        mainInsights: [cmfInsight],
      };
    }

    // Score context: write to scoreDocumentUploads + compute/persist credit score
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
            value: doc.deudaTotalVigente,
            impact: doc.deudaTotalVigente === 0 ? 100 : -50,
            explanation: doc.deudaTotalVigente === 0
              ? 'Sin deudas vigentes (excelente)'
              : `Deuda de $${doc.deudaTotalVigente.toLocaleString('es-CL')} CLP`,
          },
          {
            name: 'Deuda Indirecta',
            value: doc.deudaIndirecta,
            impact: doc.deudaIndirecta === 0 ? 50 : -30,
            explanation: doc.deudaIndirecta === 0
              ? 'Sin deudas indirectas (excelente)'
              : `Deuda indirecta de $${doc.deudaIndirecta.toLocaleString('es-CL')} CLP`,
          },
          {
            name: 'Número de Instituciones',
            value: doc.numeroInstituciones,
            impact: doc.numeroInstituciones === 0 ? 30 : -20,
            explanation: `${doc.numeroInstituciones} institución(es) reportada(s)`,
          },
        ],
      },
      {
        cmfData: doc,
        features: {
          deudaTotalVigente: doc.deudaTotalVigente,
          deudaIndirecta: doc.deudaIndirecta,
          numeroInstituciones: doc.numeroInstituciones,
          hasDebt: doc.deudaTotalVigente > 0,
          debtRatio: doc.deudaTotalVigente > 0 ? doc.deudaIndirecta / doc.deudaTotalVigente : 0,
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

    await storage.createScoreDocumentUpload(cmfRow);
    return {
      step: 'done',
      documentType: 'cmf_informe_deudas',
      cmf: { ...doc, rutDocumento: doc.rutDocumento ?? undefined },
      creditScore: scoreNum,
      mainInsights: [cmfInsight],
    };
}

/**
 * Score crediticio a partir del Informe CMF (Business Plan: sin morosidades = Excellent, 680).
 */
function computeCreditScoreFromCmf(cmf: CmfInformeDeudas): number {
  if (cmf.deudaTotalVigente === 0 && cmf.deudaIndirecta === 0) return CREDIT_SCORE_EXCELLENT;
  if (cmf.numeroInstituciones === 0) return CREDIT_SCORE_EXCELLENT;
  const ratio = cmf.deudaIndirecta / Math.max(1, cmf.deudaTotalVigente);
  const penalizacion = ratio > 0.5 ? 40 : ratio > 0.2 ? 20 : 0;
  return Math.max(300, Math.min(CREDIT_SCORE_MAX, CREDIT_SCORE_EXCELLENT - penalizacion));
}
