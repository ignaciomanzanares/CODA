import type { Express, NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/node";
import { logger } from "../../logger.js";

/**
 * Constant-time string comparison para el token de `/metrics`. Evita un side
 * channel de timing al validar `METRICS_TOKEN`. timingSafeEqual exige buffers
 * del mismo largo (de lo contrario lanza), así que comparamos el largo primero
 * (no constant-time respecto al largo, pero el token es un secreto de longitud
 * fija configurada por el operador, no entrada del atacante con largo elegido).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

type LabelSet = Record<string, string>;
type JsonLike =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonLike[]
  | { [key: string]: JsonLike };

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|set-cookie|password|passwd|token|secret|api[-_]?key|credential|session|jwt|rut|email|user[-_]?id|filename|file|body|payload|transaction|description|cartola|account|amount|monto/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CHILEAN_RUT_PATTERN = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;
const TOKENISH_PATTERN = /\b(?:token|password|secret|authorization|cookie)=([^&\s]+)/gi;
const ACCOUNTISH_PATTERN = /\b\d{8,}\b/g;

function metricKey(name: string, labels: LabelSet): string {
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return name;
  const rendered = entries
    .map(([key, value]) => `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
  return `${name}{${rendered}}`;
}

function metricBaseName(series: string): string {
  return series.split("{")[0] ?? series;
}

export class MetricsRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private help = new Map<string, string>();

  registerHelp(name: string, help: string): void {
    this.help.set(name, help);
  }

  incCounter(name: string, labels: LabelSet = {}, by = 1): void {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  setGauge(name: string, value: number, labels: LabelSet = {}): void {
    this.gauges.set(metricKey(name, labels), value);
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
  }

  render(): string {
    this.setGauge("coda_process_uptime_seconds", Math.floor(process.uptime()));

    const lines: string[] = [];
    const emitted = new Set<string>();
    const emitHeader = (series: string, type: "counter" | "gauge") => {
      const name = metricBaseName(series);
      if (emitted.has(name)) return;
      const help = this.help.get(name);
      if (help) lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      emitted.add(name);
    };

    for (const [series, value] of this.counters) {
      emitHeader(series, "counter");
      lines.push(`${series} ${value}`);
    }
    for (const [series, value] of this.gauges) {
      emitHeader(series, "gauge");
      lines.push(`${series} ${value}`);
    }

    return `${lines.join("\n")}\n`;
  }
}

export const metrics = new MetricsRegistry();
metrics.registerHelp("coda_http_requests_total", "Total HTTP requests by method, normalized route, and status.");
metrics.registerHelp("coda_http_request_duration_ms", "Last observed HTTP request duration by method and normalized route.");
metrics.registerHelp("coda_http_errors_total", "Total HTTP 5xx responses by normalized route and status.");
metrics.registerHelp("coda_process_uptime_seconds", "Process uptime in seconds.");

function sanitizeString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(CHILEAN_RUT_PATTERN, "[REDACTED_RUT]")
    .replace(TOKENISH_PATTERN, (_match, _secret) => "token=[REDACTED]")
    .replace(ACCOUNTISH_PATTERN, "[REDACTED_NUMBER]");
}

export function sanitizeForObservability(value: unknown, depth = 0): JsonLike {
  if (depth > 4) return "[REDACTED_DEPTH]";
  if (value == null) return value as null | undefined;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name),
      message: sanitizeString(value.message),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForObservability(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, JsonLike> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeForObservability(item, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function sanitizeSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.request?.data;
  if (event.request?.headers) {
    for (const key of Object.keys(event.request.headers)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        delete event.request.headers[key];
      }
    }
  }
  if (event.request?.cookies) {
    event.request.cookies = {};
  }
  if (event.extra) {
    event.extra = sanitizeForObservability(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = sanitizeForObservability(event.contexts) as typeof event.contexts;
  }
  if (event.message) {
    event.message = sanitizeString(event.message);
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      ...exception,
      value: exception.value ? sanitizeString(exception.value) : exception.value,
    }));
  }
  return event;
}

let sentryInitialized = false;

export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("[observability] SENTRY_DSN not configured; Sentry disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
  });
  sentryInitialized = true;
  logger.info("[observability] Sentry initialized");
}

export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  const safeContext = sanitizeForObservability(context) as Record<string, unknown>;

  if (sentryInitialized) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(safeContext)) {
        if (["route", "status", "method", "environment"].includes(key)) {
          scope.setTag(key, String(value));
        } else {
          scope.setExtra(key, value);
        }
      }
      Sentry.captureException(error);
    });
  }

  logger.error({ error: sanitizeForObservability(error), ...safeContext }, "captured error");
}

function fallbackNormalizePath(path: string): string {
  const normalized = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8,}-[0-9a-f-]{8,}$/i.test(segment)) return ":id";
      if (/^[0-9a-f]{12,}$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/");
  return normalized ? `/${normalized}` : "/";
}

export function getNormalizedRoute(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl ?? ""}${routePath}` || "/";
  }
  return fallbackNormalizePath(req.path);
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = getNormalizedRoute(req);
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    metrics.incCounter("coda_http_requests_total", labels);
    metrics.setGauge("coda_http_request_duration_ms", durationMs, {
      method: req.method,
      route,
    });
    if (res.statusCode >= 500) {
      metrics.incCounter("coda_http_errors_total", {
        route,
        status: String(res.statusCode),
      });
    }
  });
  next();
}

function metricsEnabled(): boolean {
  return process.env.METRICS_ENABLED === "true";
}

function readMetricsToken(req: Request): string | null {
  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return req.header("x-metrics-token") ?? null;
}

export function metricsHandler(req: Request, res: Response): void {
  if (!metricsEnabled()) {
    res.status(404).json({ message: "Not Found" });
    return;
  }

  const expectedToken = process.env.METRICS_TOKEN;
  if (process.env.NODE_ENV === "production" && !expectedToken) {
    res.status(404).json({ message: "Not Found" });
    return;
  }

  if (expectedToken) {
    const providedToken = readMetricsToken(req);
    if (!providedToken || !timingSafeStringEqual(providedToken, expectedToken)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics.render());
}

export function registerMetricsEndpoint(app: Express): void {
  app.get("/metrics", metricsHandler);
}
