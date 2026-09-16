/**
 * Worker BullMQ de la cola de conectores (D1). Corre en el mismo proceso que el worker de
 * documentos (`workers/index.ts`).
 */

import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { CONNECTOR_QUEUE_NAME, type ConnectorJobData } from "../queues/connectorQueue.js";
import { isRetryableConnectorError, runConnector } from "../connectors/runConnector.js";
import { getConnector } from "../connectors/registry.js";
import { errorCodeOf } from "../services/audit/sourceAccessAudit.js";

export async function processConnectorJob(
  job: Pick<Job<ConnectorJobData>, "id" | "data">,
): Promise<unknown> {
  try {
    return await runConnector(job.data, { jobId: String(job.id) });
  } catch (err) {
    if (isRetryableConnectorError(getConnector(job.data.connectorId), err)) throw err;
    // Sólo el código: el mensaje queda como `failedReason` en Redis y puede traer PII.
    throw new UnrecoverableError(errorCodeOf(err));
  }
}

export function startConnectorWorker(): Worker<ConnectorJobData> {
  if (!env.redisUrl) {
    throw new Error("startConnectorWorker requires REDIS_URL to be set.");
  }
  const worker = new Worker<ConnectorJobData>(CONNECTOR_QUEUE_NAME, processConnectorJob, {
    connection: { url: env.redisUrl },
    // Las fuentes limitan por titular/IP: pocas consultas a la vez.
    concurrency: Number(process.env.CONNECTOR_WORKER_CONCURRENCY) || 2,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, connectorId: job.data.connectorId }, "Connector job completed");
  });
  worker.on("failed", (job: Job<ConnectorJobData> | undefined, err: Error) => {
    logger.error(
      { jobId: job?.id, connectorId: job?.data.connectorId, errorCode: errorCodeOf(err) },
      "Connector job failed",
    );
  });

  process.once("SIGTERM", () => void worker.close());
  process.once("SIGINT", () => void worker.close());

  return worker;
}
