/**
 * SfaScoringEngine – Motor de Score Transaccional SFA
 *
 * Implementa la lógica de Score Transaccional definida en el Business plan CODA:
 * criterios de éxito = mejora del perfil de riesgo medible y verificable.
 *
 * Checklist Calidad y Cumplimiento CMF:
 * - Normalización a CLP según MSI (tabla 1). Todos los cálculos en pesos chilenos.
 * - Posiciones históricas: ventana 12 meses; si un mes no tiene datos se propaga el último saldo conocido y se marca gap.
 * - Principio de minimización: solo se procesan campos necesarios para el score; no se guardan ni registran en logs datos sensibles (nombreContraparte, RUT contraparte, etc.).
 * - Explicabilidad: mainInsights redactados para el usuario final (deber de transparencia, Anexo regulatorio).
 */

import {
  type SfaTransaccion,
  type SfaTransaccionCuenta,
  type SfaProductoVigente,
  type SfaProductoVigenteCuenta,
  type SfaProductoVigenteTarjeta,
  type SfaProductCode,
  SFA_UPDATE_TRANSACTIONS_MONTHS,
} from '../../sfa/types.js';
import type { SfaScoringInput, SfaScoringResult } from './types.js';
import { toClp, DEFAULT_EXCHANGE_RATES_CLP, type ExchangeRatesToClp } from './currency.js';

// -----------------------------------------------------------------------------
// Type guards (solo campos necesarios para el score; no exponer PII)
// -----------------------------------------------------------------------------

function isSfaTransaccionCuenta(t: SfaTransaccion): t is SfaTransaccionCuenta {
  return 'idInternoTransaccion' in t && 'fechaContableOperacion' in t && 'tipoOperacion' in t;
}

function isSfaProductoVigenteCuenta(p: SfaProductoVigente): p is SfaProductoVigenteCuenta {
  return 'lineaCreditoSobregiroTotal' in p && 'saldo' in p;
}

function isSfaProductoVigenteTarjeta(p: SfaProductoVigente): p is SfaProductoVigenteTarjeta {
  return 'lineaTotalAprobada' in p && 'saldo' in p;
}

// -----------------------------------------------------------------------------
// Helpers: fechas y ventana 12 meses
// -----------------------------------------------------------------------------

/** Parsea fecha SFA (YYYY-MM-DD o YYYY-MM-DDTHH:mm) a timestamp para ordenar. */
function parseSfaDate(s: string): number {
  const part = s.slice(0, 10);
  const d = new Date(part + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Obtiene el mes (YYYY-MM) para agrupar. */
function monthKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Ventana de 12 meses hacia atrás desde la fecha de referencia (norma SFA). */
function getWindowMonths(referenceDate: Date, months: number = SFA_UPDATE_TRANSACTIONS_MONTHS): string[] {
  const keys: string[] = [];
  const ref = new Date(referenceDate);
  for (let i = 0; i < months; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    keys.push(monthKey(d.getTime()));
  }
  return keys;
}

// -----------------------------------------------------------------------------
// Cálculo de liquidez (SfaTransaccionCuenta, últimos 12 meses)
// Montos normalizados a CLP. Gaps: meses sin datos se propagan y se cuentan.
// -----------------------------------------------------------------------------

interface LiquidityMetrics {
  averageMonthlyBalanceClp: number;
  monthsWithAbonos: number;
  monthsWithGap: number;
  totalMonthsInWindow: number;
}

function computeLiquidity(
  transaccionesCuenta: SfaTransaccionCuenta[],
  referenceDate: Date,
  rates: ExchangeRatesToClp
): LiquidityMetrics {
  const windowMonths = getWindowMonths(referenceDate);
  const twelveMonthsAgo = new Date(referenceDate);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - SFA_UPDATE_TRANSACTIONS_MONTHS);

  const inWindow = transaccionesCuenta.filter((t) => {
    const ts = parseSfaDate(t.fechaContableOperacion || t.fechaOperacion);
    return ts >= twelveMonthsAgo.getTime() && ts <= referenceDate.getTime();
  });

  inWindow.sort((a, b) => parseSfaDate(a.fechaContableOperacion) - parseSfaDate(b.fechaContableOperacion));

  let runningBalance = 0;
  const balanceByMonth = new Map<string, number>();
  const abonosByMonth = new Set<string>();

  for (const t of inWindow) {
    const sign = t.tipoOperacion === 'abono' ? 1 : -1;
    const montoClp = toClp(t.montoOperacion, t.monedaOperacion, rates);
    runningBalance += sign * montoClp;
    const m = monthKey(parseSfaDate(t.fechaContableOperacion));
    balanceByMonth.set(m, runningBalance);
    if (t.tipoOperacion === 'abono') abonosByMonth.add(m);
  }

  const sortedMonths = [...windowMonths].sort();
  let lastBalance = 0;
  let monthsWithGap = 0;
  for (const m of sortedMonths) {
    const b = balanceByMonth.get(m);
    if (b !== undefined) {
      lastBalance = b;
    } else {
      monthsWithGap += 1;
    }
    balanceByMonth.set(m, lastBalance);
  }

  let sumBalance = 0;
  for (const m of windowMonths) {
    sumBalance += balanceByMonth.get(m) ?? 0;
  }
  const averageMonthlyBalanceClp =
    windowMonths.length > 0 ? sumBalance / windowMonths.length : 0;
  const monthsWithAbonos = windowMonths.filter((m) => abonosByMonth.has(m)).length;

  return {
    averageMonthlyBalanceClp: Math.round(averageMonthlyBalanceClp),
    monthsWithAbonos,
    monthsWithGap,
    totalMonthsInWindow: windowMonths.length,
  };
}

// -----------------------------------------------------------------------------
// Análisis de deuda (SfaProductoVigenteCuenta). Montos en CLP.
// -----------------------------------------------------------------------------

function computeOverdraftRatio(
  products: SfaProductoVigente[],
  rates: ExchangeRatesToClp
): { ratio: number; count: number } {
  const cuentas = products.filter(isSfaProductoVigenteCuenta);
  let totalUtilizada = 0;
  let totalLinea = 0;
  for (const p of cuentas) {
    const total = toClp(p.lineaCreditoSobregiroTotal ?? 0, p.moneda, rates);
    const utilizada = toClp(p.lineaCreditoSobregiroUtilizada ?? 0, p.moneda, rates);
    if (total > 0) {
      totalLinea += total;
      totalUtilizada += utilizada;
    }
  }
  const ratio = totalLinea > 0 ? totalUtilizada / totalLinea : 0;
  return { ratio: Math.round(ratio * 1000) / 1000, count: cuentas.length };
}

// -----------------------------------------------------------------------------
// Salud financiera: saldo en cuenta pero deuda en tarjeta (montos en CLP)
// -----------------------------------------------------------------------------

function detectOptimizationOpportunity(products: SfaProductoVigente[], rates: ExchangeRatesToClp): boolean {
  const cuentas = products.filter(isSfaProductoVigenteCuenta);
  const tarjetas = products.filter(isSfaProductoVigenteTarjeta);
  const hasPositiveBalance = cuentas.some((c) => toClp(c.saldo, c.moneda, rates) > 0);
  const hasCardDebt = tarjetas.some((t) => toClp(t.saldo, t.moneda, rates) > 0);
  return hasPositiveBalance && hasCardDebt;
}

// -----------------------------------------------------------------------------
// Fórmula del Score Transaccional (0-100). Todas las entradas en CLP.
// -----------------------------------------------------------------------------

const SCORE_MAX = 100;

function liquidityComponent(
  avgBalanceClp: number,
  monthsWithAbonos: number,
  totalMonths: number
): number {
  if (totalMonths === 0) return 0.5;
  const stability = monthsWithAbonos / totalMonths;
  const balanceScore = avgBalanceClp >= 0 ? Math.min(1, 0.3 + (avgBalanceClp / 5000000) * 0.7) : 0;
  return 0.6 * stability + 0.4 * balanceScore;
}

function debtComponent(overdraftRatio: number): number {
  return Math.max(0, 1 - overdraftRatio);
}

function optimizationPenalty(hasOpportunity: boolean): number {
  return hasOpportunity ? 0.85 : 1;
}

// -----------------------------------------------------------------------------
// Recomendación de productos (SfaProductCode)
// -----------------------------------------------------------------------------

function recommendProducts(
  hasOptimization: boolean,
  overdraftRatio: number,
  avgBalanceClp: number,
  monthsWithAbonos: number,
  totalMonths: number
): SfaProductCode[] {
  const rec: SfaProductCode[] = [];
  if (hasOptimization) rec.push('C001');
  if (overdraftRatio > 0.5) rec.push('C003');
  if (overdraftRatio > 0.7) rec.push('C001');
  const stability = totalMonths > 0 ? monthsWithAbonos / totalMonths : 0;
  if (stability >= 0.8 && avgBalanceClp > 0) rec.push('E001');
  return [...new Set(rec)];
}

// -----------------------------------------------------------------------------
// Insights explicables para el usuario (transparencia, Anexo regulatorio)
// Solo información agregada; sin datos sensibles (nombreContraparte, RUT, etc.).
// -----------------------------------------------------------------------------

function buildExplainableInsights(
  liquidity: LiquidityMetrics,
  overdraftRatio: number,
  overdraftCount: number,
  hasOptimization: boolean,
  transactionalScore: number
): string[] {
  const total = liquidity.totalMonthsInWindow;
  const stability = total > 0 ? liquidity.monthsWithAbonos / total : 0;
  const insights: string[] = [];

  if (total > 0) {
    if (stability >= 0.75) {
      insights.push(
        `Tu score refleja una buena estabilidad de ingresos: recibiste abonos en ${liquidity.monthsWithAbonos} de los últimos ${total} meses. Esto favorece tu perfil transaccional.`
      );
    } else if (stability >= 0.5) {
      insights.push(
        `Tu estabilidad de ingresos es moderada (abonos en ${liquidity.monthsWithAbonos} de ${total} meses). Tu score podría subir si los ingresos se mantienen más regulares en los próximos meses.`
      );
    } else {
      insights.push(
        `En los últimos ${total} meses hay pocos meses con abonos registrados (${liquidity.monthsWithAbonos}). Aumentar la regularidad de ingresos puede mejorar tu score transaccional.`
      );
    }
  }

  if (liquidity.monthsWithGap > 0) {
    insights.push(
      `En ${liquidity.monthsWithGap} de los ${total} meses no hubo movimientos en cuenta; se utilizó el último saldo conocido para el cálculo, según la norma de 12 meses.`
    );
  }

  if (liquidity.averageMonthlyBalanceClp >= 0) {
    insights.push(
      `Tu saldo promedio mensual (en pesos chilenos) en la ventana de ${total} meses es positivo, lo que aporta positivamente a tu liquidez.`
    );
  } else {
    insights.push(
      `Tu saldo promedio mensual en la ventana analizada es negativo. Reducir descubiertos o usar menos la línea de sobregiro puede mejorar tu score.`
    );
  }

  if (overdraftCount > 0) {
    const pct = (overdraftRatio * 100).toFixed(0);
    if (overdraftRatio > 0.6) {
      insights.push(
        `El uso de tu línea de sobregiro es alto (${pct}%). Tu score podría subir si reduces el uso de esta línea o la pagas con más frecuencia.`
      );
    } else {
      insights.push(
        `El uso de tu línea de sobregiro está en un nivel razonable (${pct}%), lo que beneficia tu perfil.`
      );
    }
  } else {
    insights.push(`No se registra uso de línea de sobregiro en tus cuentas vigentes, lo que es favorable para tu score.`);
  }

  if (hasOptimization) {
    insights.push(
      `Tienes saldo disponible en cuenta y al mismo tiempo deuda en tarjeta de crédito. Si usas parte de ese saldo para pagar la tarjeta, podrías reducir intereses y mejorar tu score.`
    );
  }

  return insights;
}

// -----------------------------------------------------------------------------
// SfaScoringEngine
// -----------------------------------------------------------------------------

export class SfaScoringEngine {
  /**
   * Ejecuta el cálculo del Score Transaccional.
   * - Todos los montos se normalizan a CLP (MSI tabla 1).
   * - Ventana 12 meses; meses sin datos se propagan y se marcan como gap.
   * - No se almacenan ni registran datos sensibles (solo campos necesarios para el score).
   */
  run(input: SfaScoringInput, referenceDate: Date = new Date()): SfaScoringResult {
    const { transactions, products, exchangeRates } = input;
    const rates = exchangeRates ?? DEFAULT_EXCHANGE_RATES_CLP;

    const transaccionesCuenta = transactions.filter(isSfaTransaccionCuenta);

    const liquidity = computeLiquidity(transaccionesCuenta, referenceDate, rates);
    const { ratio: overdraftRatio, count: overdraftCount } = computeOverdraftRatio(products, rates);
    const hasOptimization = detectOptimizationOpportunity(products, rates);

    const liqComp = liquidityComponent(
      liquidity.averageMonthlyBalanceClp,
      liquidity.monthsWithAbonos,
      liquidity.totalMonthsInWindow
    );
    const debtComp = debtComponent(overdraftRatio);
    const penalty = optimizationPenalty(hasOptimization);
    const rawScore = (0.55 * liqComp + 0.35 * debtComp + 0.1) * penalty;
    const transactionalScore = Math.round(Math.max(0, Math.min(SCORE_MAX, rawScore * SCORE_MAX)));

    const mainInsights = buildExplainableInsights(
      liquidity,
      overdraftRatio,
      overdraftCount,
      hasOptimization,
      transactionalScore
    );

    const recommendedProducts = recommendProducts(
      hasOptimization,
      overdraftRatio,
      liquidity.averageMonthlyBalanceClp,
      liquidity.monthsWithAbonos,
      liquidity.totalMonthsInWindow
    );

    return {
      transactionalScore,
      mainInsights,
      recommendedProducts,
      metrics: {
        averageMonthlyBalanceClp: liquidity.averageMonthlyBalanceClp,
        monthsWithAbonos: liquidity.monthsWithAbonos,
        monthsWithGap: liquidity.monthsWithGap > 0 ? liquidity.monthsWithGap : undefined,
        overdraftUsageRatio: overdraftCount > 0 ? overdraftRatio : undefined,
        hasOptimizationOpportunity: hasOptimization,
      },
    };
  }
}

let defaultEngine: SfaScoringEngine | null = null;

export function getSfaScoringEngine(): SfaScoringEngine {
  if (!defaultEngine) defaultEngine = new SfaScoringEngine();
  return defaultEngine;
}
