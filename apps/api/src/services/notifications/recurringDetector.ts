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

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
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

  // 1. Solo cargos reales (no ingresos, no transferencias internas).
  const charges = txs.filter((t) => t.amount < 0 && !t.isInternalTransfer && t.description);

  // 2. Agrupar por comercio normalizado.
  const groups = new Map<string, ChargeTx[]>();
  for (const t of charges) {
    const merchant = normalizeMerchant(t.description);
    if (!merchant) continue;
    (groups.get(merchant) ?? groups.set(merchant, []).get(merchant)!).push(t);
  }

  const results: UpcomingCharge[] = [];

  for (const [merchant, list] of groups) {
    // Un cobro por mes: si hay varios en el mismo mes, el comercio no es una
    // suscripción limpia (supermercado, etc.) — quedará fuera por inconsistencia,
    // pero primero nos quedamos con el cargo más reciente de cada mes.
    const byMonth = new Map<string, ChargeTx>();
    for (const t of list) {
      const month = t.postedAt.slice(0, 7);
      const prev = byMonth.get(month);
      if (!prev || t.postedAt > prev.postedAt) byMonth.set(month, t);
    }
    // Si en algún mes hubo MUCHOS cargos, es consumo variable, no suscripción.
    const multiPerMonth = list.length > byMonth.size * 1.6;
    if (multiPerMonth) continue;

    const monthly = [...byMonth.values()].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    if (monthly.length < minOccurrences) continue;

    // 3. Último cobro reciente (no suscripción cancelada).
    const last = monthly[monthly.length - 1]!;
    if (daysBetween(toDateUTC(last.postedAt), todayUTC) > recentWithinDays) continue;

    // 4. Día del mes consistente.
    const days = monthly.map((t) => Number(t.postedAt.slice(8, 10)) || 1);
    const typicalDay = Math.round(median(days));
    const daySpreadOk = days.every((d) => Math.abs(d - typicalDay) <= 4);
    if (!daySpreadOk) continue;

    // 5. Monto consistente (coef. de variación bajo).
    const amounts = monthly.map((t) => Math.abs(t.amount));
    const typicalAmount = Math.round(median(amounts));
    const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const variance = amounts.reduce((s, n) => s + (n - mean) ** 2, 0) / amounts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    if (cv > 0.35) continue;

    // 6. Predecir el próximo cobro: primer día==typicalDay que sea > la fecha del
    //    último cobro (evita "predecir" un cobro que ya ocurrió este mes).
    const lastDate = toDateUTC(last.postedAt);
    let next = clampDayToMonth(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), typicalDay);
    while (next <= lastDate) {
      next = clampDayToMonth(next.getUTCFullYear(), next.getUTCMonth() + 1, typicalDay);
    }

    const daysUntil = daysBetween(todayUTC, next);
    if (daysUntil < 0 || daysUntil > windowDays) continue;

    results.push({
      merchant,
      typicalAmountClp: typicalAmount,
      typicalDay,
      nextChargeDate: ymd(next),
      daysUntil,
      occurrences: monthly.length,
      cycle: ymd(next).slice(0, 7),
    });
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}
