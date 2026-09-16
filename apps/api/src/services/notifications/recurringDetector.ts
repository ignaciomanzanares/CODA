/**
 * Detección de cobros recurrentes (suscripciones/PAC) a partir del historial de
 * movimientos, para el recordatorio proactivo "X te suele cobrar ~$Y alrededor del
 * día D".
 *
 * Función PURA y testeable: entra una lista de cargos, sale la lista de próximos
 * cobros que caen dentro de la ventana. Conservador a propósito (v1) — mejor NO
 * notificar que notificar de más:
 *   - agrupa por comercio normalizado (mismo normalizeMerchant del categorizador);
 *   - exige >= minOccurrences cargos en meses DISTINTOS (cadencia mensual);
 *   - el día del mes debe ser consistente (dispersión acotada);
 *   - el monto debe ser consistente (coef. de variación acotado);
 *   - el último cobro debe ser reciente (no recordar suscripciones ya canceladas).
 */
import { normalizeMerchant } from "../../parsers/merchantCategorizer.js";
import { findMonthlySeries } from "../transactions/recurringSeries.js";

export interface ChargeTx {
  description: string;
  postedAt: string; // YYYY-MM-DD
  amount: number; // firmado: cargo negativo
  isInternalTransfer?: boolean;
}

export interface UpcomingCharge {
  /** Comercio normalizado (forma canónica, para mostrar y para dedup). */
  merchant: string;
  /** Monto típico en CLP (positivo). */
  typicalAmountClp: number;
  /** Día del mes típico (1..31). */
  typicalDay: number;
  /** Fecha estimada del próximo cobro (YYYY-MM-DD). */
  nextChargeDate: string;
  /** Días desde hoy hasta el próximo cobro. */
  daysUntil: number;
  /** Cuántos cobros previos se observaron. */
  occurrences: number;
  /** YYYY-MM del cobro estimado — clave de deduplicación por ciclo. */
  cycle: string;
}

export interface DetectOptions {
  /** Fecha de referencia (default: hoy). */
  today?: Date;
  /** Ventana de aviso: cobros dentro de estos días entran (default 4). */
  windowDays?: number;
  /** Mínimo de cobros en meses distintos para considerar recurrente (default 3). */
  minOccurrences?: number;
  /** El último cobro debe ser dentro de estos días (default 45). */
  recentWithinDays?: number;
}

function toDateUTC(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Clampa un día al último día real del mes (evita 31 de febrero → 28/29). */
function clampDayToMonth(year: number, monthIdx0: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIdx0, Math.min(day, lastDay)));
}

export function detectUpcomingRecurringCharges(
  txs: ChargeTx[],
  opts: DetectOptions = {},
): UpcomingCharge[] {
  const today = opts.today ?? new Date();
  const windowDays = opts.windowDays ?? 4;
  const minOccurrences = opts.minOccurrences ?? 3;
  const recentWithinDays = opts.recentWithinDays ?? 45;
  const todayUTC = toDateUTC(ymd(today));

  // 1–5. Series mensuales con el núcleo compartido (B6), con los criterios ORIGINALES de este
  //      recordatorio: comercio normalizado, día lineal ±4, CV ≤ 0.35, ≤1.6 cargos por mes, y
  //      sólo la marca de transferencia interna como exclusión.
  const series = findMonthlySeries(txs, {
    direction: "egreso",
    keyOf: normalizeMerchant,
    minOccurrences,
    maxDaySpread: 4,
    circularDays: false,
    maxAmountCv: 0.35,
    maxPerMonthRatio: 1.6,
    monthlyAmount: "latest",
    exclude: (t) => Boolean(t.isInternalTransfer),
  });

  const results: UpcomingCharge[] = [];

  for (const s of series) {
    // Último cobro reciente (no suscripción cancelada).
    if (daysBetween(toDateUTC(s.last.postedAt), todayUTC) > recentWithinDays) continue;

    // 6. Predecir el próximo cobro: primer día==typicalDay que sea > la fecha del
    //    último cobro (evita "predecir" un cobro que ya ocurrió este mes).
    const lastDate = toDateUTC(s.last.postedAt);
    let next = clampDayToMonth(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), s.typicalDay);
    while (next <= lastDate) {
      next = clampDayToMonth(next.getUTCFullYear(), next.getUTCMonth() + 1, s.typicalDay);
    }

    const daysUntil = daysBetween(todayUTC, next);
    if (daysUntil < 0 || daysUntil > windowDays) continue;

    results.push({
      merchant: s.key,
      typicalAmountClp: s.typicalAmountClp,
      typicalDay: s.typicalDay,
      nextChargeDate: ymd(next),
      daysUntil,
      occurrences: s.monthly.length,
      cycle: ymd(next).slice(0, 7),
    });
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}
