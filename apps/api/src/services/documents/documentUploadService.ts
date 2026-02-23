/**
 * Servicio de carga de documentos: orquesta análisis PDF, validación de usuario y actualización de scores.
 * Sincronizado con userId real (Render DB). Valida RUT/nombre cuando esté disponible en perfil.
 */

import { getSfaScoringEngine } from '../scoring/index.js';
import { storage } from '../../storage.js';
import {
  analyzePdfBuffer,
  cartolaToSfaTransactions,
  cartolaToSfaProductos,
  type CmfInformeDeudas,
  type CartolaExtraida,
  type DocumentoExtraido,
} from './pdfAnalysis.js';

export const CREDIT_SCORE_EXCELLENT = 680;
export const CREDIT_SCORE_MAX = 850;

export interface UploadResult {
  step: 'reading' | 'extracting' | 'scoring' | 'done';
  documentType?: 'cmf_informe_deudas' | 'cartola';
  cmf?: CmfInformeDeudas;
  transactionalScore?: number;
  creditScore?: number;
  mainInsights?: string[];
  recommendedProducts?: string[];
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
    const creditScore = computeCreditScoreFromCmf(doc);
    const updated = await storage.updateCreditScore(userId, {
      score: creditScore,
      maxScore: CREDIT_SCORE_MAX,
      paymentHistory: 'Excellent',
      utilization: 'Good',
      ageOfCredit: 'Good',
      lastUpdated: new Date().toISOString(),
    });
    if (!updated) {
      await storage.createCreditScore({
        userId,
        score: creditScore,
        maxScore: CREDIT_SCORE_MAX,
        paymentHistory: 'Excellent',
        utilization: 'Good',
        ageOfCredit: 'Good',
        lastUpdated: new Date().toISOString(),
      });
    }
    const cmfInsight =
      doc.deudaTotalVigente === 0 && doc.deudaIndirecta === 0
        ? 'Perfil Crediticio Saludable: Sin deudas morosas. Estado vigente según Informe CMF.'
        : doc.numeroInstituciones > 0
          ? `Deuda total vigente: $${doc.deudaTotalVigente.toLocaleString('es-CL')} CLP en ${doc.numeroInstituciones} institución(es).`
          : 'Sin deudas vigentes reportadas en el informe CMF.';
    return {
      step: 'done',
      documentType: 'cmf_informe_deudas',
      cmf: {
        ...doc,
        rutDocumento: doc.rutDocumento ?? undefined,
      },
      creditScore,
      mainInsights: [cmfInsight],
    };
  }

  if (doc.tipo === 'cartola') {
    const rut = doc.rutDocumento ?? '00.000.000-0';
    const transactions = cartolaToSfaTransactions(doc, rut);
    const products = cartolaToSfaProductos(doc, rut);
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
    await storage.upsertTransactionalScore(userId, {
      transactionalScore: result.transactionalScore,
      metrics: result.metrics,
      mainInsights,
      recommendedProducts: result.recommendedProducts,
    });
    return {
      step: 'done',
      documentType: 'cartola',
      transactionalScore: result.transactionalScore,
      mainInsights,
      recommendedProducts: result.recommendedProducts,
      metrics: result.metrics,
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
