/**
 * Cola BullMQ para el pipeline pesado de subida de documentos (OCR/parseo PDF + scoring SFA),
 * que hoy corre síncrono dentro del request HTTP de `POST /api/documents/upload`
 * (`services/documents/documentUploadService.ts`). Mover esto a una cola evita que un pico de
 * uploads compita por CPU con el resto de las requests, y permite escalar el worker aparte.
 *
 * Si `REDIS_URL` no está definida (dev local sin Redis), `documentQueue` es `null` y el caller
 * (`routes.ts`) procesa el documento de forma síncrona como hacía antes — mismo patrón de
 * fallback que `middleware/rateLimiter.ts`.
 */

import { Queue } from "bullmq";
import { env } from "../env.js";

export const DOCUMENT_QUEUE_NAME = "document-upload";

export interface DocumentUploadJobData {
  userId: string;
  /** Buffer del PDF, serializado en base64 para viajar como payload del job en Redis. */
  fileBase64: string;
}

// BullMQ trae su propia copia de ioredis internamente — pasarle la URL (en vez de nuestra
// instancia compartida de `redis.ts`) evita un conflicto de tipos entre ambas copias del paquete.
export const documentQueue: Queue<DocumentUploadJobData> | null = env.redisUrl
  ? new Queue<DocumentUploadJobData>(DOCUMENT_QUEUE_NAME, {
      connection: { url: env.redisUrl },
      defaultJobOptions: {
        removeOnComplete: { age: 60 * 60 }, // 1h — alcanza para que el cliente haga polling del resultado
        removeOnFail: { age: 24 * 60 * 60 },
        // Un documento corrupto/no soportado NO lanza: completa con `result.error` (ver
        // processDocumentUpload, que atrapa ParseError). Un job "failed" es un throw de
        // infraestructura (hiccup de Neon/Redis) → reintentar SÍ ayuda, y el pipeline es
        // idempotente (cartola duplicada por banco+período se reemplaza, no se duplica).
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    })
  : null;
