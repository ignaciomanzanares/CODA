/**
 * Servicio de indicadores económicos: UF y dólar observado, en CLP, por fecha.
 *
 * Fuente: mindicador.cl
 *   - UF:    https://mindicador.cl/api/uf/dd-mm-yyyy
 *   - Dólar: https://mindicador.cl/api/dolar/dd-mm-yyyy
 *
 * Los resultados se cachean en la tabla `indicator_values` por (kind, date) para
 * no refetchar. Resiliencia en capas: fecha exacta → retroceso hasta 5 días
 * hábiles (feriados/fines de semana no tienen dólar observado) → serie reciente
 * completa → (solo USD, fechas ≤45 días) tasa actual de er-api. Si TODO falla
 * devuelve `null`; para cartolas TC internacional el caller ABORTA el upload
 * (ParseError FX_UNAVAILABLE) — el viejo `fxPending` insertaba movimientos con
 * monto $0 permanentes.
 */

import { db, indicatorValues, eq } from "../db/index.js";
import { logger } from "../logger.js";

export type IndicatorKind = "uf" | "usd";

/** Endpoint de mindicador.cl por tipo de indicador. */
const ENDPOINT: Record<IndicatorKind, string> = {
  uf: "uf",
  usd: "dolar",
};

const FETCH_TIMEOUT_MS = 8_000;

/** Fecha → ISO yyyy-mm-dd (clave de caché, en hora local del servidor). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Fecha → dd-mm-yyyy (formato que exige la URL de mindicador.cl). */
export function toMindicadorDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${d}-${m}-${y}`;
}

/**
 * Extrae el valor del indicador desde la respuesta de mindicador.cl.
 * Forma esperada: `{ serie: [{ fecha, valor }] }`. Devuelve null si no hay dato.
 * Exportada para tests sin red.
 */
export function parseMindicadorValue(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const serie = (json as { serie?: unknown }).serie;
  if (!Array.isArray(serie) || serie.length === 0) return null;
  const valor = (serie[0] as { valor?: unknown })?.valor;
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * De una serie completa de mindicador (endpoint sin fecha: últimos ~30 valores,
 * más recientes primero), elige el valor del día hábil más cercano ANTERIOR O
 * IGUAL a `isoDate`; si la fecha pedida es anterior a toda la serie, null (una
 * tasa muy posterior distorsionaría una cartola vieja). Exportada para tests.
 */
export function pickSerieValueAtOrBefore(json: unknown, isoDate: string): number | null {
  if (!json || typeof json !== "object") return null;
  const serie = (json as { serie?: unknown }).serie;
  if (!Array.isArray(serie)) return null;
  for (const item of serie) {
    const fecha = (item as { fecha?: unknown })?.fecha;
    const valor = (item as { valor?: unknown })?.valor;
    if (typeof fecha !== "string" || typeof valor !== "number") continue;
    if (!Number.isFinite(valor) || valor <= 0) continue;
    if (fecha.slice(0, 10) <= isoDate) return valor;
  }
  return null;
}

/** Lee el valor cacheado para (kind, isoDate), o null si no está. */
async function readCache(kind: IndicatorKind, isoDate: string): Promise<number | null> {
  try {
    const id = `${kind}:${isoDate}`;
    const rows = await db.select().from(indicatorValues).where(eq(indicatorValues.id, id));
    const v = rows[0]?.valueClp;
    return typeof v === "number" ? v : null;
  } catch (e) {
    // Una falla de lectura de caché no debe romper la ingesta: tratamos como miss.
    logger.warn({ err: e, kind, isoDate }, "indicators: cache read failed");
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
    logger.warn({ err: e, kind, isoDate }, "indicators: cache write failed");
  }
}

/** Fetch por fecha exacta a mindicador.cl. null si no hay dato o falla la red. */
async function fetchMindicadorDate(kind: IndicatorKind, date: Date): Promise<number | null> {
  const isoDate = toIsoDate(date);
  const url = `https://mindicador.cl/api/${ENDPOINT[kind]}/${toMindicadorDate(date)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn({ kind, isoDate, status: res.status }, "indicators: fetch non-ok");
      return null;
    }
    return parseMindicadorValue(await res.json());
  } catch (e) {
    logger.warn({ err: e, kind, isoDate, url }, "indicators: fetch failed");
    return null;
  }
}

// El dólar observado solo existe en días hábiles: una cartola emitida en fin de
// semana/feriado no tiene valor para SU fecha aunque mindicador esté vivo.
// Retrocedemos hasta 5 días (cubre fin de semana largo + feriado pegado).
const MAX_BACKTRACK_DAYS = 5;

/**
 * Devuelve el valor en CLP de 1 unidad del indicador en la fecha dada.
 * Cache-first; ante miss consulta mindicador.cl y cachea. Si la fecha exacta no
 * tiene valor (feriado/fin de semana) retrocede hasta 5 días; si mindicador por
 * fecha falla, intenta la serie reciente completa (1 request) tomando el día
 * hábil más cercano anterior. Devuelve null solo si todo lo anterior falla.
 */
async function getIndicator(kind: IndicatorKind, date: Date): Promise<number | null> {
  const isoDate = toIsoDate(date);

  // 1) Fecha exacta y retroceso por días hábiles (caché → red por cada día).
  for (let back = 0; back <= MAX_BACKTRACK_DAYS; back++) {
    const d = new Date(date);
    d.setDate(d.getDate() - back);
    const dIso = toIsoDate(d);

    const cached = await readCache(kind, dIso);
    if (cached != null) return cached;

    const fetched = await fetchMindicadorDate(kind, d);
    if (fetched != null) {
      await writeCache(kind, dIso, fetched);
      return fetched;
    }
  }

  // 2) Serie reciente completa (endpoint sin fecha): un request que cubre el caso
  //    "mindicador vivo pero la fecha pedida no resuelve" para fechas recientes.
  try {
    const res = await fetch(`https://mindicador.cl/api/${ENDPOINT[kind]}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const value = pickSerieValueAtOrBefore(await res.json(), isoDate);
      if (value != null) {
        await writeCache(kind, isoDate, value);
        return value;
      }
    }
  } catch (e) {
    logger.warn({ err: e, kind, isoDate }, "indicators: serie fallback failed");
  }

  return null;
}

/** Días de diferencia (absoluta) entre la fecha y hoy. */
function daysFromToday(date: Date): number {
  return Math.abs(Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

/** Valor en CLP de 1 UF en la fecha dada, o null si no disponible. */
export function getUf(date: Date): Promise<number | null> {
  return getIndicator("uf", date);
}

/**
 * Valor en CLP de 1 USD (dólar observado) en la fecha dada, o null si no
 * disponible. Último recurso con mindicador caído: tasa ACTUAL de er-api, solo
 * para fechas recientes (≤45 días — una tasa de hoy aplicada a una cartola
 * vieja distorsionaría los montos). No se cachea: es aproximada; cuando
 * mindicador vuelva, la fecha se resuelve con el valor oficial.
 */
export async function getUsd(date: Date): Promise<number | null> {
  const oficial = await getIndicator("usd", date);
  if (oficial != null) return oficial;

  if (daysFromToday(date) > 45) return null;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { CLP?: unknown } };
    const clp = data?.rates?.CLP;
    if (typeof clp === "number" && Number.isFinite(clp) && clp > 0) {
      logger.warn(
        { isoDate: toIsoDate(date), rate: clp },
        "indicators: usando tasa USD actual de er-api (mindicador no disponible)",
      );
      return clp;
    }
  } catch (e) {
    logger.warn({ err: e }, "indicators: er-api fallback failed");
  }
  return null;
}
