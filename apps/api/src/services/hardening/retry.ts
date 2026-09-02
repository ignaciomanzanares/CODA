/**
 * D8 — Retry con backoff exponencial + jitter, reutilizable por los conectores de fuentes
 * (CMF/SII/AFC/scraper). Reintenta solo errores marcados como reintentables (por defecto todos),
 * con espera creciente y aleatorizada para no martillar la fuente. `sleep` y `random` son
 * inyectables → testeable sin esperas reales.
 */

export interface RetryOptions {
  /** Intentos totales (incluye el primero). Default 3. */
  attempts?: number;
  /** Espera base del backoff en ms. Default 200. */
  baseDelayMs?: number;
  /** Tope de espera por intento en ms. Default 5000. */
  maxDelayMs?: number;
  /** Factor exponencial. Default 2. */
  factor?: number;
  /** Aplica jitter (± aleatorio) a la espera. Default true. */
  jitter?: boolean;
  /** ¿El error es reintentable? Default: siempre. */
  retryable?: (err: unknown) => boolean;
  /** Callback por reintento (para logging/observabilidad). */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Inyectables para tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Calcula la espera del intento `attempt` (1-based) con backoff exponencial acotado + jitter. */
export function backoffDelay(
  attempt: number,
  o: Required<Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "factor" | "jitter">>,
  random: () => number,
): number {
  const raw = o.baseDelayMs * Math.pow(o.factor, attempt - 1);
  const capped = Math.min(o.maxDelayMs, raw);
  if (!o.jitter) return Math.round(capped);
  // Jitter "full": entre 50% y 100% del valor (evita sincronización de reintentos).
  return Math.round(capped * (0.5 + 0.5 * random()));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const cfg = {
    baseDelayMs: opts.baseDelayMs ?? 200,
    maxDelayMs: opts.maxDelayMs ?? 5000,
    factor: opts.factor ?? 2,
    jitter: opts.jitter ?? true,
  };
  const retryable = opts.retryable ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === attempts;
      if (isLast || !retryable(err)) throw err;
      const delay = backoffDelay(attempt, cfg, random);
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
