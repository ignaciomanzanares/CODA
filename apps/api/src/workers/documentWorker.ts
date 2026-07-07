/**
 * Worker BullMQ que ejecuta el pipeline pesado de subida de documentos (antes síncrono dentro del
 * request HTTP, ver `queues/documentQueue.ts`). Pensado para correr como proceso separado
 * (`npm run worker -w @coda/api` / servicio `coda-document-worker` en render.yaml), para que un
 * pico de OCR/parseo no compita por CPU con las requests HTTP normales.
 */

import * as os from 'node:os';
import { Worker, type Job } from 'bullmq';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { processDocumentUpload, type UploadResult } from '../services/documents/index.js';
import { shutdownOcrPool } from '../services/documents/ocrService.js';
import { DOCUMENT_QUEUE_NAME, type DocumentUploadJobData } from '../queues/documentQueue.js';

/**
 * Concurrencia ligada a cores (#19): por defecto = nº de CPUs, acotada a [2, 4] para no
 * saturar memoria (cada job rasteriza PDFs + corre OCR). Coincide con el tamaño del pool de
 * workers Tesseract (OCR_POOL_SIZE), así los jobs concurrentes se reparten 1:1 entre los
 * workers del pool. Override explícito con DOCUMENT_WORKER_CONCURRENCY.
 */
function resolveConcurrency(): number {
  const explicit = Number(process.env.DOCUMENT_WORKER_CONCURRENCY);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(2, Math.min(os.cpus().length, 4));
}

async function processJob(job: Job<DocumentUploadJobData>): Promise<UploadResult> {
  const buffer = Buffer.from(job.data.fileBase64, 'base64');
  return processDocumentUpload(job.data.userId, buffer);
}

export function startDocumentWorker(): Worker<DocumentUploadJobData, UploadResult> {
  if (!env.redisUrl) {
    throw new Error('startDocumentWorker requires REDIS_URL to be set.');
  }
  const concurrency = resolveConcurrency();
  logger.info({ concurrency, cpus: os.cpus().length }, 'Document worker concurrency resuelta');
  const worker = new Worker<DocumentUploadJobData, UploadResult>(DOCUMENT_QUEUE_NAME, processJob, {
    connection: { url: env.redisUrl },
    concurrency,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, userId: job.data.userId }, 'Document upload job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, userId: job?.data.userId, err }, 'Document upload job failed');
  });

  // Apagado limpio: cerrar el pool de workers Tesseract al terminar el worker.
  const shutdown = async () => {
    await shutdownOcrPool();
    await worker.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return worker;
}

// Permite correr este archivo directamente como proceso del worker: `tsx src/workers/documentWorker.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting document upload worker...');
  startDocumentWorker();
}
