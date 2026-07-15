/**
 * Monitor de profundidad de cola (#27): alerta a Ops cuando la cola de procesamiento de
 * documentos acumula demasiados jobs en espera (worker caído o saturado). Usa `notifyOps`
 * (no-op si `OPS_WEBHOOK_URL` no está) y expone `coda_queue_waiting` como métrica.
 */
import { documentQueue } from "../../queues/documentQueue.js";
import { notifyOps, metrics } from "./index.js";
import { logger } from "../../logger.js";

const ALERT_THRESHOLD = Number(process.env.QUEUE_DEPTH_ALERT_THRESHOLD) || 50;
const CHECK_INTERVAL_MS = Number(process.env.QUEUE_DEPTH_CHECK_INTERVAL_MS) || 60_000;

metrics.registerHelp("coda_queue_waiting", "Jobs en espera en la cola de documentos");

let alerting = false; // evita spamear el webhook mientras siga alto

export async function checkQueueDepth(): Promise<{ waiting: number; alerted: boolean } | null> {
  if (!documentQueue) return null;
  try {
    const counts = await documentQueue.getJobCounts("waiting", "active", "delayed");
    const waiting = Number(counts.waiting ?? 0);
    metrics.setGauge("coda_queue_waiting", waiting);

    let alerted = false;
    if (waiting >= ALERT_THRESHOLD && !alerting) {
      alerting = true;
      alerted = true;
      await notifyOps(
        `Cola de documentos saturada: ${waiting} jobs en espera (umbral ${ALERT_THRESHOLD}).`,
        {
          waiting,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          hint: "¿El worker (coda-document-worker) está corriendo?",
        },
      );
    } else if (waiting < ALERT_THRESHOLD && alerting) {
      alerting = false; // se normalizó; permite una nueva alerta futura
    }
    return { waiting, alerted };
  } catch (e) {
    logger.warn({ err: e }, "[queueMonitor] no se pudo leer la profundidad de la cola");
    return null;
  }
}

/** Arranca el chequeo periódico. Devuelve el timer (con unref) o null si no hay cola. */
export function startQueueDepthMonitor(): NodeJS.Timeout | null {
  if (!documentQueue) {
    logger.info("[queueMonitor] sin cola (REDIS_URL ausente) — monitor desactivado");
    return null;
  }
  void checkQueueDepth();
  const timer = setInterval(() => void checkQueueDepth(), CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
