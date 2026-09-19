/**
 * Monitor de profundidad de cola (#27): alerta a Ops cuando la cola de procesamiento de
 * documentos acumula demasiados jobs en espera (worker caído o saturado). Usa `notifyOps`
 * (no-op si `OPS_WEBHOOK_URL` no está) y expone `coda_queue_waiting` como métrica.
 */
import { documentQueue } from "../../queues/documentQueue.js";
import { connectorQueue } from "../../queues/connectorQueue.js";
import { notifyOps, metrics } from "./index.js";
import { logger } from "../../logger.js";

const ALERT_THRESHOLD = Number(process.env.QUEUE_DEPTH_ALERT_THRESHOLD) || 50;
const CHECK_INTERVAL_MS = Number(process.env.QUEUE_DEPTH_CHECK_INTERVAL_MS) || 60_000;

metrics.registerHelp("coda_queue_waiting", "Jobs en espera en la cola de documentos");
metrics.registerHelp(
  "coda_connector_queue_waiting",
  "Jobs en espera en la cola de conectores de fuentes",
);

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

/**
 * La cola de CONECTORES (D1) también necesita vigilancia, y por un motivo distinto al de
 * documentos: un upload atascado lo nota el usuario, que está esperando su cartola en pantalla.
 * Una consulta a una fuente que se encola y nadie procesa no la nota nadie — el usuario cree que
 * sus datos están al día. Si el worker se cae, esto es lo único que avisa.
 */
let alertandoConectores = false;

export async function checkConnectorQueueDepth(): Promise<{
  waiting: number;
  alerted: boolean;
} | null> {
  if (!connectorQueue) return null;
  try {
    const counts = await connectorQueue.getJobCounts("waiting", "active", "delayed", "failed");
    const waiting = Number(counts.waiting ?? 0);
    metrics.setGauge("coda_connector_queue_waiting", waiting);

    let alerted = false;
    if (waiting >= ALERT_THRESHOLD && !alertandoConectores) {
      alertandoConectores = true;
      alerted = true;
      await notifyOps(
        `Cola de conectores saturada: ${waiting} consultas a fuentes en espera (umbral ${ALERT_THRESHOLD}).`,
        {
          waiting,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          hint: "¿El worker de conectores está corriendo? Sin él, las consultas se encolan y el usuario cree que sus datos están al día.",
        },
        { key: "connector_queue_depth" },
      );
    } else if (waiting < ALERT_THRESHOLD && alertandoConectores) {
      alertandoConectores = false;
    }
    return { waiting, alerted };
  } catch (e) {
    logger.warn({ err: e }, "[queueMonitor] no se pudo leer la cola de conectores");
    return null;
  }
}

/** Sólo para tests. */
export function resetQueueAlertState(): void {
  alerting = false;
  alertandoConectores = false;
}

/** Arranca el chequeo periódico de AMBAS colas. Devuelve el timer (con unref) o null si no hay. */
export function startQueueDepthMonitor(): NodeJS.Timeout | null {
  if (!documentQueue && !connectorQueue) {
    logger.info("[queueMonitor] sin colas (REDIS_URL ausente) — monitor desactivado");
    return null;
  }
  const revisar = () => {
    void checkQueueDepth();
    void checkConnectorQueueDepth();
  };
  revisar();
  const timer = setInterval(revisar, CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
