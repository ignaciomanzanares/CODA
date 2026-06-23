/**
 * Job store + worker para el OCR de inscripciones escaneadas.
 *
 * El OCR (mupdf+tesseract) tarda ~200s en el instance free de Render — demasiado
 * para correr sincrónico (el request hace timeout). Solo las inscripciones SIN
 * capa de texto lo disparan. El endpoint crea un job, responde 202 y aquí se
 * corre el OCR FUERA del ciclo del request, en una cola serial en proceso (sin
 * infra ni deps nuevas). Al terminar se guarda el prefill en `result`.
 *
 * No cambia la lógica de extracción/OCR — sólo decide CUÁNDO/CÓMO se ejecuta.
 */
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, inscripcionJobs } from '../../db/index.js';
import { logger } from '../../logger.js';
import {
  extractInscripcionFromBuffer,
  resolveInscripcionPrefill,
  type InscripcionExtractionOutcome,
  type AssetPrefill,
} from '../../parsers/inscripcionExtractor.js';

/** Payload del prefill — MISMA forma para el camino sincrónico (200) y el job. */
export interface InscripcionResponsePayload {
  ok: boolean;
  usedOcr?: boolean;
  manualFallback?: boolean;
  message?: string;
  prefill?: AssetPrefill;
  extracted?: {
    dominio: unknown;
    rolAvaluo: string;
    comuna: string;
    compraventaUf: number;
    hipoteca: unknown;
    fechaInscripcion: Date | null;
  };
}

/**
 * Arma el payload de respuesta desde un outcome de extracción. Compartido por el
 * fast-path (capa de texto) y el worker (OCR), para que ambos devuelvan lo mismo.
 * Resuelve las tasas UF (costo a fecha de escritura; estimado a UF de hoy).
 */
export async function buildInscripcionResponse(
  outcome: InscripcionExtractionOutcome,
): Promise<InscripcionResponsePayload> {
  if (!outcome.ok || !outcome.result) {
    // Escaneo ilegible / OCR no disponible → ingreso manual (no es error).
    return { ok: false, manualFallback: true, message: outcome.message };
  }
  const prefill = await resolveInscripcionPrefill(outcome.result);
  return {
    ok: true,
    usedOcr: outcome.usedOcr,
    prefill,
    extracted: {
      dominio: outcome.result.dominio,
      rolAvaluo: outcome.result.rolAvaluo,
      comuna: outcome.result.comuna,
      compraventaUf: outcome.result.compraventaUf,
      hipoteca: outcome.result.hipoteca,
      fechaInscripcion: outcome.result.fechaInscripcion,
    },
  };
}

export type InscripcionJobStatus = 'processing' | 'done' | 'error';

export interface InscripcionJobView {
  status: InscripcionJobStatus;
  result?: InscripcionResponsePayload;
  message?: string;
}

/** Crea un job en estado `processing` para el usuario. Devuelve su id. */
export async function createInscripcionJob(userId: string): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(inscripcionJobs).values({
    id,
    userId,
    status: 'processing',
    result: null,
    message: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Lee un job — SOLO si pertenece al usuario (otro dueño → null). */
export async function getInscripcionJob(
  jobId: string,
  userId: string,
): Promise<InscripcionJobView | null> {
  const [row] = await db
    .select()
    .from(inscripcionJobs)
    .where(and(eq(inscripcionJobs.id, jobId), eq(inscripcionJobs.userId, userId)));
  if (!row) return null;
  let result: InscripcionResponsePayload | undefined;
  if (row.result != null) {
    // `result` se guarda como JSON en TEXT; defensivo por si algún día es jsonb.
    try {
      result = typeof row.result === 'string' ? JSON.parse(row.result) : (row.result as InscripcionResponsePayload);
    } catch {
      result = undefined;
    }
  }
  return {
    status: row.status as InscripcionJobStatus,
    result,
    message: row.message ?? undefined,
  };
}

async function updateJob(
  jobId: string,
  patch: { status: InscripcionJobStatus; result?: string | null; message?: string | null },
): Promise<void> {
  await db
    .update(inscripcionJobs)
    .set({
      status: patch.status,
      result: patch.result ?? null,
      message: patch.message ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(inscripcionJobs.id, jobId));
}

// Cola serial en proceso: corre un OCR a la vez para no saturar el instance free.
let queue: Promise<void> = Promise.resolve();

/**
 * Encola el OCR de un job para correr fuera del request. El buffer se retiene en
 * el closure hasta procesarse. Nunca lanza hacia afuera: al fallar deja el job en
 * `error` con un mensaje (no un 500; el request ya respondió 202).
 */
export function enqueueInscripcionOcr(jobId: string, buffer: Buffer): void {
  queue = queue.then(async () => {
    try {
      const outcome = await extractInscripcionFromBuffer(buffer); // camino completo (con OCR)
      const payload = await buildInscripcionResponse(outcome);
      await updateJob(jobId, {
        status: 'done',
        result: JSON.stringify(payload),
        message: payload.message ?? null,
      });
    } catch (e) {
      logger.error({ err: e, jobId }, 'inscripcion OCR job failed');
      await updateJob(jobId, {
        status: 'error',
        message: 'No se pudo procesar la inscripción. Ingresa los datos manualmente.',
      }).catch(() => {});
    }
  });
}
