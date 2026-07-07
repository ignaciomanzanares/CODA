/**
 * Registro del resultado de cada intento de parseo (#32).
 *
 * Antes, un fallo de parseo devolvía un error genérico y no se guardaba nada: imposible saber
 * qué bancos/formatos fallan más. Ahora cada intento (éxito o fallo) deja una fila en
 * `document_parse_outcomes` con banco/tier/confianza/error, y el fallo devuelve al usuario un
 * mensaje accionable.
 */
import { randomUUID } from 'node:crypto';
import { db, documentParseOutcomes } from '../../db/index.js';
import { logger } from '../../logger.js';

export interface ParseOutcome {
  status: 'success' | 'failed' | 'partial';
  documentType?: 'cartola' | 'cmf' | 'unknown';
  banco?: string | null;
  detectionTier?: string | null;
  parseConfidence?: number | null;
  transactionCount?: number | null;
  errorMessage?: string | null;
}

export async function recordParseOutcome(userId: string, outcome: ParseOutcome): Promise<void> {
  try {
    await db.insert(documentParseOutcomes).values({
      id: randomUUID(),
      userId,
      status: outcome.status,
      documentType: outcome.documentType ?? null,
      banco: outcome.banco ?? null,
      detectionTier: outcome.detectionTier ?? null,
      parseConfidence: outcome.parseConfidence ?? null,
      transactionCount: outcome.transactionCount ?? null,
      errorMessage: outcome.errorMessage ?? null,
    });
  } catch (e) {
    // No fatal: registrar el outcome nunca debe romper el flujo de upload.
    logger.warn({ err: e, userId }, '[parseOutcomes] no se pudo registrar el outcome (no fatal)');
  }
}

/**
 * Mensaje accionable para el usuario ante un fallo de parseo. Si conocemos el banco, lo nombra;
 * si no, sugiere los formatos soportados. No expone detalles técnicos del error.
 */
export function userFacingParseError(banco?: string | null): string {
  const base = banco
    ? `No pudimos leer tu cartola de ${banco}.`
    : 'No pudimos leer el documento que subiste.';
  return (
    `${base} Asegúrate de subir el PDF original del banco (no una foto ni una captura de pantalla), ` +
    `con el detalle de movimientos visible. Si el problema persiste, prueba descargar la cartola ` +
    `nuevamente desde tu banca en línea y vuelve a subirla.`
  );
}
