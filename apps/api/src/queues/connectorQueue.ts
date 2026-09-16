/**
 * Cola BullMQ de corridas de conectores de fuentes (D1). Mismo patrón que `documentQueue.ts`: si
 * `REDIS_URL` no está definida, `connectorQueue` es `null` y `requestConnectorRun` ejecuta el
 * conector en el mismo proceso (con reintentos en memoria).
 *
 * El payload NUNCA lleva secretos ni datos del titular: sólo a quién y qué conector correr.
 */

import { Queue } from "bullmq";
import { env } from "../env.js";
import type { SourceAccessTrigger } from "../services/audit/sourceAccessAudit.js";

export const CONNECTOR_QUEUE_NAME = "connector-run";

export interface ConnectorJobData {
  userId: string;
  connectorId: string;
  trigger: SourceAccessTrigger;
}

export const connectorQueue: Queue<ConnectorJobData> | null = env.redisUrl
  ? new Queue<ConnectorJobData>(CONNECTOR_QUEUE_NAME, {
      connection: { url: env.redisUrl },
      defaultJobOptions: {
        removeOnComplete: { age: 60 * 60 },
        removeOnFail: { age: 24 * 60 * 60 },
        // Las fuentes fallan por timeouts y caídas pasajeras → reintentar con espera creciente.
        // Lo que no tiene arreglo (sin consentimiento, conector desconocido) sale como
        // UnrecoverableError en el worker y no se reintenta.
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    })
  : null;
