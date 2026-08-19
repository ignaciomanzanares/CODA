/**
 * Métricas MENSUALES de salud financiera a partir de las transacciones normalizadas.
 *
 * Los totales de `transactions` suman TODO el histórico del usuario (varios meses).
 * Las métricas de salud y las elegibilidades de programas (umbrales de ingreso,
 * APV/DAP, "meses de fondo de emergencia") son MENSUALES, así que hay que
 * normalizar por la cantidad de meses con datos. Antes esto se omitía y
 * `mesesCubiertos = saldo / gasto_total_histórico` subestimaba el fondo de
 * emergencia por Nx (N = nº de meses), marcando "crítico" a usuarios sanos.
 */

/** Mínimo que necesita el cálculo de una transacción normalizada. */
export interface HealthTxLike {
  month?: string; // "YYYY-MM"
  tipo: "ingreso" | "egreso";
  abono: number;
  cargo: number;
  categoria?: string;
}

export interface MonthlyHealthMetrics {
  /** Suma bruta del histórico (todos los meses con datos). */
  totalIncome: number;
  totalExpenses: number;
  /** Meses DISTINTOS con datos (mínimo 1). */
  monthsCount: number;
  /** Promedios mensuales = total / monthsCount. */
  monthlyIncome: number;
  monthlyExpenses: number;
  /** Tasa de ahorro (%): ratio, invariante a la escala mensual/total. */
  savingsRate: number;
  hasEduExpenses: boolean;
  eduTotal: number;
  /** Gasto en educación como % del ingreso. */
  eduPct: number;
}

/**
 * Agrega las transacciones normalizadas en métricas mensuales de salud,
 * excluyendo transferencias internas (pago de tarjeta, divisas) para que no
 * inflen ingreso ni tasa de ahorro.
 */
export function computeMonthlyHealthMetrics(
  txs: HealthTxLike[],
  isInternalTransferTx: (t: HealthTxLike) => boolean,
): MonthlyHealthMetrics {
  let totalIncome = 0;
  let totalExpenses = 0;
  let hasEduExpenses = false;
  let eduTotal = 0;
  const monthsWithData = new Set<string>();

  for (const t of txs) {
    if (isInternalTransferTx(t)) continue;
    if (t.month) monthsWithData.add(t.month);
    if (t.tipo === "ingreso") {
      totalIncome += t.abono;
    } else {
      totalExpenses += t.cargo;
      if (t.categoria === "educacion") {
        hasEduExpenses = true;
        eduTotal += t.cargo;
      }
    }
  }

  const monthsCount = Math.max(1, monthsWithData.size);
  const savingsRate =
    totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;
  const eduPct = totalIncome > 0 ? Math.round((eduTotal / totalIncome) * 100) : 0;

  return {
    totalIncome,
    totalExpenses,
    monthsCount,
    monthlyIncome: totalIncome / monthsCount,
    monthlyExpenses: totalExpenses / monthsCount,
    savingsRate,
    hasEduExpenses,
    eduTotal,
    eduPct,
  };
}

/** Meses de fondo de emergencia = saldo actual / gasto MENSUAL (no el total histórico). */
export function mesesDeFondoEmergencia(saldoActual: number, monthlyExpenses: number): number {
  return monthlyExpenses > 0 ? saldoActual / monthlyExpenses : 0;
}
