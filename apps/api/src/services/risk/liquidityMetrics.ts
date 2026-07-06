/**
 * Métricas de liquidez transaccional (saldo promedio, estabilidad de abonos, uso de sobregiro).
 *
 * Extraídas VERBATIM del difunto `sfaScoringEngine.ts`: son métricas FÁCTICAS (no un score), y el
 * motor de salud depende de `averageMonthlyBalanceClp` como proxy de activos líquidos. Se conservan
 * al eliminar el scoring heurístico (que no estaba respaldado por dataset ni proceso científico).
 * El score transaccional ahora lo da el modelo XGB (`transactionalScore.ts`).
 *
 * Normalización a CLP (MSI tabla 1); ventana 12 meses; meses sin datos propagan el último saldo.
 */
import {
  type SfaTransaccion,
  type SfaTransaccionCuenta,
  type SfaProductoVigente,
  type SfaProductoVigenteCuenta,
  type SfaProductoVigenteTarjeta,
  SFA_UPDATE_TRANSACTIONS_MONTHS,
} from '../../sfa/types.js';
import { toClp, DEFAULT_EXCHANGE_RATES_CLP, type ExchangeRatesToClp } from '../scoring/currency.js';

function isSfaTransaccionCuenta(t: SfaTransaccion): t is SfaTransaccionCuenta {
  return 'idInternoTransaccion' in t && 'fechaContableOperacion' in t && 'tipoOperacion' in t;
}
function isSfaProductoVigenteCuenta(p: SfaProductoVigente): p is SfaProductoVigenteCuenta {
  return 'lineaCreditoSobregiroTotal' in p && 'saldo' in p;
}
function isSfaProductoVigenteTarjeta(p: SfaProductoVigente): p is SfaProductoVigenteTarjeta {
  return 'lineaTotalAprobada' in p && 'saldo' in p;
}

function parseSfaDate(s: string): number {
  const part = s.slice(0, 10);
  const d = new Date(part + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function monthKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function getWindowMonths(referenceDate: Date, months: number = SFA_UPDATE_TRANSACTIONS_MONTHS): string[] {
  const keys: string[] = [];
  const ref = new Date(referenceDate);
  for (let i = 0; i < months; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    keys.push(monthKey(d.getTime()));
  }
  return keys;
}

interface LiquidityInternal {
  averageMonthlyBalanceClp: number;
  monthsWithAbonos: number;
  observedMonths: number;
  monthsWithGap: number;
  totalMonthsInWindow: number;
}

function computeLiquidity(
  transaccionesCuenta: SfaTransaccionCuenta[],
  referenceDate: Date,
  rates: ExchangeRatesToClp,
): LiquidityInternal {
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
    const montoClp = Math.abs(toClp(t.montoOperacion, t.monedaOperacion, rates));
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
    if (b !== undefined) lastBalance = b;
    else monthsWithGap += 1;
    balanceByMonth.set(m, lastBalance);
  }

  let sumBalance = 0;
  for (const m of windowMonths) sumBalance += balanceByMonth.get(m) ?? 0;
  const averageMonthlyBalanceClp = windowMonths.length > 0 ? sumBalance / windowMonths.length : 0;
  const monthsWithAbonos = windowMonths.filter((m) => abonosByMonth.has(m)).length;
  const observedMonths = windowMonths.filter((m) =>
    inWindow.some((t) => monthKey(parseSfaDate(t.fechaContableOperacion)) === m),
  ).length;

  return {
    averageMonthlyBalanceClp: Math.round(averageMonthlyBalanceClp),
    monthsWithAbonos,
    observedMonths,
    monthsWithGap,
    totalMonthsInWindow: windowMonths.length,
  };
}

function computeOverdraftRatio(products: SfaProductoVigente[], rates: ExchangeRatesToClp): { ratio: number; count: number } {
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

function detectOptimizationOpportunity(products: SfaProductoVigente[], rates: ExchangeRatesToClp): boolean {
  const cuentas = products.filter(isSfaProductoVigenteCuenta);
  const tarjetas = products.filter(isSfaProductoVigenteTarjeta);
  const hasPositiveBalance = cuentas.some((c) => toClp(c.saldo, c.moneda, rates) > 0);
  const hasCardDebt = tarjetas.some((t) => toClp(t.saldo, t.moneda, rates) > 0);
  return hasPositiveBalance && hasCardDebt;
}

/** Métricas de liquidez (misma forma que el antiguo `SfaScoringResult.metrics`, sin el score). */
export interface LiquidityMetrics {
  averageMonthlyBalanceClp: number;
  monthsWithAbonos: number;
  observedMonths: number;
  monthsWithGap?: number;
  overdraftUsageRatio?: number;
  hasOptimizationOpportunity: boolean;
  scoreConfidence: 'baja' | 'media' | 'alta';
}

export interface LiquidityInput {
  transactions: SfaTransaccion[];
  products: SfaProductoVigente[];
  exchangeRates?: ExchangeRatesToClp;
}

/** Computa las métricas de liquidez a partir de transacciones/productos SFA (normalizados a CLP). */
export function computeLiquidityMetrics(input: LiquidityInput, referenceDate: Date = new Date()): LiquidityMetrics {
  const rates = input.exchangeRates ?? DEFAULT_EXCHANGE_RATES_CLP;
  const transaccionesCuenta = input.transactions.filter(isSfaTransaccionCuenta);
  const liquidity = computeLiquidity(transaccionesCuenta, referenceDate, rates);
  const { ratio: overdraftRatio, count: overdraftCount } = computeOverdraftRatio(input.products, rates);
  const hasOptimization = detectOptimizationOpportunity(input.products, rates);

  return {
    averageMonthlyBalanceClp: liquidity.averageMonthlyBalanceClp,
    monthsWithAbonos: liquidity.monthsWithAbonos,
    observedMonths: liquidity.observedMonths,
    monthsWithGap: liquidity.monthsWithGap > 0 ? liquidity.monthsWithGap : undefined,
    overdraftUsageRatio: overdraftCount > 0 ? overdraftRatio : undefined,
    hasOptimizationOpportunity: hasOptimization,
    scoreConfidence: liquidity.observedMonths < 3 ? 'baja' : liquidity.observedMonths < 6 ? 'media' : 'alta',
  };
}
