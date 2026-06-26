/**
 * Bootstrap de observabilidad — Frente 0 del overhaul.
 *
 * Todo está detrás de flags de entorno y degrada a no-op si no se configuran, para
 * que el código quede 100% listo sin exigir cuentas externas hoy:
 *  - `SENTRY_DSN`      → captura de errores con `@sentry/node` (dep opcional, import dinámico).
 *  - `OPS_WEBHOOK_URL` → `notifyOps()` postea alertas (Slack/Discord webhook). Si no, loguea.
 *  - `/metrics`        → registro de métricas in-house en formato Prometheus (sin deps).
 *
 * Ver `docs/INTEGRATION_GUIDE.md` para activarlos.
 */

import { logger } from '../../logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Métricas in-house (formato texto Prometheus, sin dependencias)
// ─────────────────────────────────────────────────────────────────────────────

type LabelSet = Record<string, string>;

function seriesKey(name: string, labels: LabelSet): string {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`);
  return parts.length ? `${name}{${parts.join(',')}}` : name;
}

class MetricsRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private help = new Map<string, string>();

  registerHelp(name: string, help: string): void {
    this.help.set(name, help);
  }

  incCounter(name: string, labels: LabelSet = {}, by = 1): void {
    const key = seriesKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  setGauge(name: string, value: number, labels: LabelSet = {}): void {
    this.gauges.set(seriesKey(name, labels), value);
  }

  /** Serializa en formato de exposición Prometheus. */
  render(): string {
    const lines: string[] = [];
    const emitHelp = (metric: string) => {
      const h = this.help.get(metric);
      if (h) lines.push(`# HELP ${metric} ${h}`);
    };
    const baseName = (series: string) => series.split('{')[0];
    const seen = new Set<string>();
    for (const [series, val] of this.counters) {
      const m = baseName(series);
      if (!seen.has(m)) { emitHelp(m); lines.push(`# TYPE ${m} counter`); seen.add(m); }
      lines.push(`${series} ${val}`);
    }
    for (const [series, val] of this.gauges) {
      const m = baseName(series);
      if (!seen.has(m)) { emitHelp(m); lines.push(`# TYPE ${m} gauge`); seen.add(m); }
      lines.push(`${series} ${val}`);
    }
    return lines.join('\n') + '\n';
  }
}

export const metrics = new MetricsRegistry();
metrics.registerHelp('coda_http_requests_total', 'Total de requests HTTP por método/ruta/status');
metrics.registerHelp('coda_http_request_duration_ms', 'Última latencia observada por ruta (ms)');
metrics.registerHelp('coda_errors_total', 'Errores capturados por la capa de observabilidad');

// ─────────────────────────────────────────────────────────────────────────────
// Sentry (opcional, import dinámico de especificador no-literal)
// ─────────────────────────────────────────────────────────────────────────────

let sentry: any = null;

/** Inicializa Sentry si `SENTRY_DSN` está presente y la dep instalada. No-op si no. */
export async function initObservability(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('[observability] SENTRY_DSN no configurado — captura de errores deshabilitada');
    return;
  }
  try {
    const pkg = '@sentry/node';
    const mod: any = await import(pkg);
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
    sentry = mod;
    logger.info('[observability] Sentry inicializado');
  } catch (e) {
    logger.warn({ err: e }, '[observability] SENTRY_DSN seteado pero @sentry/node no instalado — instala la dep (ver guía)');
  }
}

/** Reporta un error a Sentry (si está) y siempre al logger + contador de métricas. */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  metrics.incCounter('coda_errors_total', { kind: String(context.kind ?? 'unhandled') });
  try {
    sentry?.captureException?.(err, { extra: context });
  } catch {
    /* nunca dejar que el reporte de error rompa el flujo */
  }
  logger.error({ err, ...context }, 'captured error');
}

// ─────────────────────────────────────────────────────────────────────────────
// Alertas operacionales
// ─────────────────────────────────────────────────────────────────────────────

/** Envía una alerta al webhook de Ops (`OPS_WEBHOOK_URL`) si está configurado; si no, loguea. */
export async function notifyOps(message: string, details: Record<string, unknown> = {}): Promise<void> {
  const url = process.env.OPS_WEBHOOK_URL;
  if (!url) {
    logger.warn({ ...details }, `[ops-alert] ${message}`);
    return;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🔔 CODA: ${message}`, details }),
      signal: controller.signal,
    });
    clearTimeout(t);
  } catch (e) {
    logger.error({ err: e, message }, '[observability] notifyOps falló');
  }
}
