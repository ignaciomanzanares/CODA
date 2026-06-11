/**
 * Servicio de indicadores económicos: UF y dólar observado, en CLP, por fecha.
 *
 * Fuente: mindicador.cl
 *   - UF:    https://mindicador.cl/api/uf/dd-mm-yyyy
 *   - Dólar: https://mindicador.cl/api/dolar/dd-mm-yyyy
 *
 * Los resultados se cachean en la tabla `indicator_values` por (kind, date) para
 * no refetchar. La conversión es deliberadamente tolerante a fallos: si el fetch
 * falla o la fecha no está disponible, devuelve `null` y el caller debe guardar
 * el monto en moneda nativa + marcar `fxPending=true`. NUNCA bloquea la ingesta.
 */

import { db, indicatorValues, eq } from '../db/index.js';
import { logger } from '../logger.js';

export type IndicatorKind = 'uf' | 'usd';

/** Endpoint de mindicador.cl por tipo de indicador. */
const ENDPOINT: Record<IndicatorKind, string> = {
  uf: 'uf',
  usd: 'dolar',
};

const FETCH_TIMEOUT_MS = 8_000;

/** Fecha → ISO yyyy-mm-dd (clave de caché, en hora local del servidor). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fecha → dd-mm-yyyy (formato que exige la URL de mindicador.cl). */
export function toMindicadorDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}-${m}-${y}`;
}

/**
 * Extrae el valor del indicador desde la respuesta de mindicador.cl.
 * Forma esperada: `{ serie: [{ fecha, valor }] }`. Devuelve null si no hay dato.
 * Exportada para tests sin red.
 */
export function parseMindicadorValue(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null;
  const serie = (json as { serie?: unknown }).serie;
  if (!Array.isArray(serie) || serie.length === 0) return null;
  const valor = (serie[0] as { valor?: unknown })?.valor;
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Lee el valor cacheado para (kind, isoDate), o null si no está. */
async function readCache(kind: IndicatorKind, isoDate: string): Promise<number | null> {
  try {
    const id = `${kind}:${isoDate}`;
    const rows = await db.select().from(indicatorValues).where(eq(indicatorValues.id, id));
    const v = rows[0]?.valueClp;
    return typeof v === 'number' ? v : null;
  } catch (e) {
    // Una falla de lectura de caché no debe romper la ingesta: tratamos como miss.
    logger.warn({ err: e, kind, isoDate }, 'indicators: cache read failed');
    return null;
  }
}

/** Persiste el valor en caché (best-effort; un fallo de escritura no propaga). */
async function writeCache(kind: IndicatorKind, isoDate: string, value: number): Promise<void> {
  try {
    const id = `${kind}:${isoDate}`;
    await db
      .insert(indicatorValues)
      .values({ id, kind, date: isoDate, valueClp: value, fetchedAt: new Date().toISOString() })
      .onConflictDoNothing();
  } catch (e) {
    logger.warn({ err: e, kind, isoDate }, 'indicators: cache write failed');
  }
}

/**
 * Devuelve el valor en CLP de 1 unidad del indicador en la fecha dada.
 * Cache-first; si hay miss, consulta mindicador.cl y cachea. Devuelve null
 * (sin lanzar) ante cualquier fallo de red, fecha no disponible o dato inválido.
 */
async function getIndicator(kind: IndicatorKind, date: Date): Promise<number | null> {
  const isoDate = toIsoDate(date);

  const cached = await readCache(kind, isoDate);
  if (cached != null) return cached;

  const url = `https://mindicador.cl/api/${ENDPOINT[kind]}/${toMindicadorDate(date)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn({ kind, isoDate, status: res.status }, 'indicators: fetch non-ok');
      return null;
    }
    const value = parseMindicadorValue(await res.json());
    if (value == null) {
      logger.warn({ kind, isoDate }, 'indicators: no value for date');
      return null;
    }
    await writeCache(kind, isoDate, value);
    return value;
  } catch (e) {
    logger.warn({ err: e, kind, isoDate, url }, 'indicators: fetch failed');
    return null;
  }
}

/** Valor en CLP de 1 UF en la fecha dada, o null si no disponible. */
export function getUf(date: Date): Promise<number | null> {
  return getIndicator('uf', date);
}

/** Valor en CLP de 1 USD (dólar observado) en la fecha dada, o null si no disponible. */
export function getUsd(date: Date): Promise<number | null> {
  return getIndicator('usd', date);
}
