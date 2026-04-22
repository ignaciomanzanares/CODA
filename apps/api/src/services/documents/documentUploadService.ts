/**
 * Servicio de carga de documentos: orquesta análisis PDF, validación de usuario y actualización de scores.
 * Sincronizado con userId real (Render DB). Valida RUT/nombre cuando esté disponible en perfil.
 */

import { randomUUID } from 'crypto';
import { getSfaScoringEngine } from '../scoring/index.js';
import { storage } from '../../storage.js';
import { logger } from '../../logger.js';
import {
  analyzePdfBuffer,
  extractPdfText,
  cartolaToSfaTransactions,
  cartolaToSfaProductos,
  type CmfInformeDeudas,
  type CartolaExtraida,
  type DocumentoExtraido,
} from './pdfAnalysis.js';
import { detectFormat } from '../../parsers/detectFormat.js';
import { getDetectionTier, type DetectionTier } from '../../parsers/base.js';
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
 */
export async function processDocumentUpload(
  userId: string,
  buffer: Buffer
): Promise<UploadResult> {
  const doc = await analyzePdfBuffer(buffer);
  if (!doc) {
    return {
      step: 'done',
      error: 'No se pudo reconocer el documento. Asegúrate de subir un Informe de Deudas CMF o una Cartola Bancaria en PDF.',
    };
  }

  const validation = validateDocumentBelongsToUser(userId, doc.rutDocumento ?? undefined);
  if (!validation.valid) {
    return { step: 'done', error: validation.message ?? 'El documento no corresponde al usuario.' };
  }

  if (doc.tipo === 'cmf_informe_deudas') {
    const uploadId = randomUUID();
    // RUT como ancla: el informe debe contener un RUT válido (ej. 21.486.204-2). Si no hay, 400.
    const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dKk]\b/;
    const rutExtraido = doc.rutDocumento?.trim();
    const rutValido = rutExtraido && RUT_RE.test(rutExtraido);
    if (!rutValido) {
      return {
        step: 'done',
        error: 'No se encontró un RUT válido en el Informe CMF. Verifica que el PDF sea un informe de deudas oficial.',
      };
    }
    
    const startTime = Date.now();
    const requestId = randomUUID();
    
    const creditScoreValue = computeCreditScoreFromCmf(doc);
    const scoreNum = Number(creditScoreValue);
    
    // Determine risk category
    const riskCategory = scoreNum >= 750 ? 'EXCELLENT'
      : scoreNum >= 680 ? 'GOOD'
      : scoreNum >= 620 ? 'AVERAGE'
      : scoreNum >= 550 ? 'POOR'
      : 'VERY_POOR';
    
    // Approximate PD (Probability of Default) from score
    const pd = Math.max(0, Math.min(1, (850 - scoreNum) / 550));
    
    // Log prediction for audit trail (CMF compliance)
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
              : `Deuda de $${doc.deudaTotalVigente.toLocaleString('es-CL')} CLP`
          },
          {
            name: 'Deuda Indirecta',
            value: doc.deudaIndirecta,
            impact: doc.deudaIndirecta === 0 ? 50 : -30,
            explanation: doc.deudaIndirecta === 0
              ? 'Sin deudas indirectas (excelente)'
              : `Deuda indirecta de $${doc.deudaIndirecta.toLocaleString('es-CL')} CLP`
          },
          {
            name: 'Número de Instituciones',
            value: doc.numeroInstituciones,
            impact: doc.numeroInstituciones === 0 ? 30 : -20,
            explanation: `${doc.numeroInstituciones} institución(es) reportada(s)`
          }
        ]
      },
      {
        cmfData: doc,
        features: {
          deudaTotalVigente: doc.deudaTotalVigente,
          deudaIndirecta: doc.deudaIndirecta,
          numeroInstituciones: doc.numeroInstituciones,
          hasDebt: doc.deudaTotalVigente > 0,
          debtRatio: doc.deudaTotalVigente > 0 ? doc.deudaIndirecta / doc.deudaTotalVigente : 0
        }
      },
      {
        processingTimeMs: Date.now() - startTime
      }
    );
    
    logger.info(
      { userId, requestId, predictionLogId, score: scoreNum },
      '[documentUploadService] CMF: prediction logged for audit trail'
    );
    
    // Mismo patrón que cartola: un solo upsert con userId (ensureUserForToken ya dio el userId de la ruta).
    const creditPayload = {
      score: scoreNum,
      maxScore: CREDIT_SCORE_MAX,
      paymentHistory: 'Excellent',
      utilization: 'Good',
      ageOfCredit: 'Good',
      lastUpdated: new Date().toISOString(),
    };
    console.log('[documentUploadService] creditPayload exacto:', JSON.stringify(creditPayload));
    logger.info(
      { userId, creditPayload },
      '[documentUploadService] CMF: mismo riel que cartola → storage.upsertCreditScore(userId, payload)'
    );
    // Misma forma de llamar al storage que cartolas: un solo upsert con userId.
    await storage.upsertCreditScore(userId, creditPayload);
    // Confirmación de DB: solo 200 OK si foundAfterSave es positivo.
    const afterSave = await storage.getCreditScore(userId);
    if (!afterSave) {
      logger.error({ userId }, '[documentUploadService] CMF: upsert ejecutado pero getCreditScore no devolvió fila');
      throw new Error('Credit score no persistido en base de datos. Reintenta más tarde.');
    }
    const scoreEnDb = Number(afterSave.score);
    if (scoreEnDb !== scoreNum) {
      logger.error({ userId, esperado: scoreNum, enDb: scoreEnDb }, '[documentUploadService] CMF: score en DB no coincide');
      throw new Error(`Credit score persistido no coincide (esperado ${scoreNum}, en DB ${scoreEnDb}). Reintenta más tarde.`);
    }
    logger.info({ userId, score: scoreEnDb, foundAfterSave: true }, '[documentUploadService] CMF: confirmación DB OK, respondiendo 200');
    const cmfInsight =
      doc.deudaTotalVigente === 0 && doc.deudaIndirecta === 0
        ? 'Perfil Crediticio Saludable: Sin deudas morosas. Estado vigente según Informe CMF.'
        : doc.numeroInstituciones > 0
          ? `Deuda total vigente: $${doc.deudaTotalVigente.toLocaleString('es-CL')} CLP en ${doc.numeroInstituciones} institución(es).`
          : 'Sin deudas vigentes reportadas en el informe CMF.';
    await storage.createDocumentUpload({
      id: uploadId,
      userId,
      tipo: "cmf",
      banco: null,
      periodoDesde: null,
      periodoHasta: null,
      parsedData: doc,
      parseStatus: "success",
    });
    return {
      step: 'done',
      documentType: 'cmf_informe_deudas',
      cmf: {
        ...doc,
        rutDocumento: doc.rutDocumento ?? undefined,
      },
      creditScore: scoreNum,
      mainInsights: [cmfInsight],
    };
  }

  if (doc.tipo === 'cartola') {
    // Detect tier from the PDF text (parallel to analyzePdfBuffer extraction)
    let detectedTier: DetectionTier = 'HIGH';
    let bancoCon = 1.0;
    let detectedBanco = (doc as any).banco ?? 'Desconocido';
    try {
      const { text: pdfText } = await extractPdfText(buffer);
      if (pdfText && pdfText.length >= 40) {
        const fmt = detectFormat(pdfText);
        detectedTier = getDetectionTier(fmt.confidence);
        bancoCon = fmt.confidence;
        if (fmt.banco !== 'Desconocido') detectedBanco = fmt.banco;
      }
    } catch {
      /* detection failure is non-fatal — proceed with default HIGH tier */
    }

    const rut = doc.rutDocumento ?? '00.000.000-0';
    // Acumular todas las cartolas parseadas del usuario + la cartola actual.
    const previousCartolas = await storage.listDocumentUploadsByType(userId, "cartola");
    const previousParsed: CartolaExtraida[] = previousCartolas
      .map((r) => r?.parsedData as CartolaExtraida | null)
      .filter((c): c is CartolaExtraida => !!c && Array.isArray(c.transacciones));
    const allCartolas = [...previousParsed, doc];
    const transactions = allCartolas.flatMap((c) => cartolaToSfaTransactions(c, c.rutDocumento ?? rut));
    const products = allCartolas.flatMap((c) => cartolaToSfaProductos(c, c.rutDocumento ?? rut));
    const engine = getSfaScoringEngine();
    const result = engine.run({ transactions, products });
    const hasInterest = doc.transacciones.some(
      (t) => /interés|interes|intereses|línea|linea|crédito|credito|tarjeta/i.test(t.descripcion)
    );
    const mainInsights = [...result.mainInsights];
    if (hasInterest) {
      mainInsights.push(
        'Detectamos intereses de línea de crédito o tarjeta en tu cartola. Te recomendamos consolidar deudas y evaluar ofertas de ahorro según el Business Plan.'
      );
    }
    await storage.createDocumentUpload({
      id: randomUUID(),
      userId,
      tipo: "cartola",
      banco: (doc as any).banco ?? null,
      periodoDesde: (doc as any).periodo?.desde ? String((doc as any).periodo.desde) : null,
      periodoHasta: (doc as any).periodo?.hasta ? String((doc as any).periodo.hasta) : null,
      parsedData: doc,
      parseStatus: "success",
    });
    await storage.upsertTransactionalScore(userId, {
      transactionalScore: result.transactionalScore,
      metrics: result.metrics,
      mainInsights,
      recommendedProducts: result.recommendedProducts,
      algorithmInputs: {
        pipeline: 'cartola_pdf_aggregated',
        transactionCount: transactions.length,
        productCount: products.length,
        cartolasCount: allCartolas.length,
      },
    });
    return {
      step: 'done',
      documentType: 'cartola',
      transactionalScore: result.transactionalScore,
      mainInsights,
      recommendedProducts: result.recommendedProducts,
      metrics: result.metrics,
      detection_tier: detectedTier,
      banco_confidence: bancoCon,
      detected_banco: detectedBanco,
    };
  }

  return { step: 'done', error: 'Tipo de documento no soportado.' };
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
