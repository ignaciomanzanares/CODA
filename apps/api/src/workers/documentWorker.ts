/**
 * Worker BullMQ que ejecuta el pipeline pesado de subida de documentos (antes síncrono dentro del
 * request HTTP, ver `queues/documentQueue.ts`). Pensado para correr como proceso separado
 * (`npm run worker -w @coda/api` / servicio `coda-document-worker` en render.yaml), para que un
 * pico de OCR/parseo no compita por CPU con las requests HTTP normales.
 */

import { Worker, type Job } from 'bullmq';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { processDocumentUpload, type UploadResult } from '../services/documents/index.js';
import { DOCUMENT_QUEUE_NAME, type DocumentUploadJobData } from '../queues/documentQueue.js';

async function processJob(job: Job<DocumentUploadJobData>): Promise<UploadResult> {
  const buffer = Buffer.from(job.data.fileBase64, 'base64');
  return processDocumentUpload(job.data.userId, buffer);
}

export function startDocumentWorker(): Worker<DocumentUploadJobData, UploadResult> {
  if (!env.redisUrl) {
    throw new Error('startDocumentWorker requires REDIS_URL to be set.');
  }
  const worker = new Worker<DocumentUploadJobData, UploadResult>(DOCUMENT_QUEUE_NAME, processJob, {
    connection: { url: env.redisUrl },
    concurrency: Number(process.env.DOCUMENT_WORKER_CONCURRENCY) || 2,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, userId: job.data.userId }, 'Document upload job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, userId: job?.data.userId, err }, 'Document upload job failed');
  });

  return worker;
}

// Permite correr este archivo directamente como proceso del worker: `tsx src/workers/documentWorker.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting document upload worker...');
  startDocumentWorker();
}
