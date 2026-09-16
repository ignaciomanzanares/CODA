/**
 * D1 — Ejecución de conectores: en la cola si hay Redis, en el proceso si no. En ambos casos el
 * conector corre dentro de `withSourceAccess` (gate de consentimiento + traza por consulta), así
 * que ningún camino puede consultar una fuente sin autorización ni sin registro.
 */

import type { Queue } from "bullmq";
import { ConsentRequiredError } from "../services/consent/consentGate.js";
import { withSourceAccess } from "../services/audit/sourceAccessAudit.js";
import { retryWithBackoff } from "../services/hardening/retry.js";
import { connectorQueue, type ConnectorJobData } from "../queues/connectorQueue.js";
import { getConnector, type SourceConnector } from "./registry.js";

export class UnknownConnectorError extends Error {
  readonly code = "unknown_connector";
  constructor(readonly connectorId: string) {
    super(`Conector no registrado: '${connectorId}'`);
    this.name = "UnknownConnectorError";
  }
}

/** Errores que ningún reintento arregla. */
export function isRetryableConnectorError(
  connector: SourceConnector | undefined,
  err: unknown,
): boolean {
  if (err instanceof ConsentRequiredError || err instanceof UnknownConnectorError) return false;
  return connector?.isRetryable?.(err) ?? true;
}

/** Una corrida (un intento): gate + traza + conector. La usa el worker y el camino en proceso. */
export async function runConnector(
  data: ConnectorJobData,
  opts: { jobId?: string } = {},
): Promise<unknown> {
  const connector = getConnector(data.connectorId);
  if (!connector) throw new UnknownConnectorError(data.connectorId);
  return withSourceAccess(
    data.userId,
    connector.resourceType,
    {
      connectorId: connector.id,
      trigger: data.trigger,
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
    },
    (grant) => connector.run({ userId: data.userId, ...grant }),
  );
}

export type ConnectorRunRequest =
  { mode: "queued"; jobId: string } | { mode: "inline"; result: unknown };

/**
 * Pide correr un conector para un usuario. Con cola: encola (una sola corrida pendiente por
 * usuario+conector) y responde al tiro. Sin cola: corre acá, con los mismos reintentos.
 */
export async function requestConnectorRun(
  userId: string,
  connectorId: string,
  opts: {
    trigger?: ConnectorJobData["trigger"];
    queue?: Pick<Queue<ConnectorJobData>, "add"> | null;
    retry?: Parameters<typeof retryWithBackoff>[1];
  } = {},
): Promise<ConnectorRunRequest> {
  const connector = getConnector(connectorId);
  if (!connector) throw new UnknownConnectorError(connectorId);
  const data: ConnectorJobData = { userId, connectorId, trigger: opts.trigger ?? "user" };

  const queue = opts.queue === undefined ? connectorQueue : opts.queue;
  if (queue) {
    const job = await queue.add(connectorId, data, {
      // Pedir dos veces la misma fuente mientras la primera sigue pendiente no agrega trabajo.
      deduplication: { id: `${connectorId}-${userId}` },
    });
    return { mode: "queued", jobId: String(job.id) };
  }

  const result = await retryWithBackoff(() => runConnector(data), {
    attempts: 3,
    baseDelayMs: 1000,
    ...opts.retry,
    retryable: (err) => isRetryableConnectorError(connector, err),
  });
  return { mode: "inline", result };
}
