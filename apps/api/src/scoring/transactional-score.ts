/**
 * Score transaccional 0–100 a partir de CartolaParseResult (Hjelkrem et al. 2022, adaptado).
 */

import type { CartolaParseResult } from "../parsers/cartola-parser.js";

export interface TransactionalScoreResult {
  score: number;
  subscores: {
    liquidez: number;
    estabilidad_ingresos: number;
    gastos_fijos_sobre_ingresos: number;
    dias_saldo_critico: number;
    tendencia_ahorro: number;
    fondo_emergencia: number;
    consistencia_gastos: number;
  };
  pesos: Record<string, number>;
  insights: string[];
}

const CRITICO_CLP = 10_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreLiquidez(ratio: number): number {
  if (ratio >= 30) return 100;
  if (ratio >= 15) return clamp(70 + ((ratio - 15) / 15) * 29, 70, 99);
  if (ratio >= 7) return clamp(40 + ((ratio - 7) / 8) * 29, 40, 69);
  if (ratio >= 3) return clamp(20 + ((ratio - 3) / 4) * 19, 20, 39);
  return clamp((ratio / 3) * 19, 0, 19);
}

function scoreEstabilidadCv(cv: number): number {
  if (cv < 0.2) return 100;
  if (cv <= 0.5) return clamp(60 + ((0.5 - cv) / 0.3) * 39, 60, 99);
  return clamp((1 - Math.min(cv, 1)) * 59, 0, 59);
}

function scoreGastosFijosRatio(ratio: number): number {
  if (ratio < 0.3) return 100;
  if (ratio <= 0.5) return clamp(70 + ((0.5 - ratio) / 0.2) * 29, 70, 99);
  if (ratio <= 0.7) return clamp(40 + ((0.7 - ratio) / 0.2) * 29, 40, 69);
  return clamp((1 - ratio) * 39, 0, 39);
}

function scoreDiasCriticos(dias: number): number {
  if (dias === 0) return 100;
  if (dias <= 3) return clamp(70 + ((3 - dias) / 3) * 29, 70, 99);
  if (dias <= 7) return clamp(40 + ((7 - dias) / 4) * 29, 40, 69);
  if (dias <= 15) return clamp(20 + ((15 - dias) / 8) * 19, 20, 39);
  return clamp((1 - Math.min(dias, 30) / 30) * 19, 0, 19);
}

function scoreTendencia(delta: number): number {
  if (delta > 0.1) return 100;
  if (delta >= 0) return clamp(70 + (delta / 0.1) * 29, 70, 99);
  if (delta >= -0.1) return clamp(40 + ((delta + 0.1) / 0.1) * 29, 40, 69);
  return clamp((1 + delta) * 39, 0, 39);
}

/**
 * Emergency fund coverage: balance / monthly expenses.
 * ≥ 3 months → 100, 2-3 → 80, 1-2 → 55, 0.5-1 → 30, < 0.5 → 10
 */
function scoreFondoEmergencia(mesesCubiertos: number): number {
  if (mesesCubiertos >= 3) return 100;
  if (mesesCubiertos >= 2) return clamp(80 + ((mesesCubiertos - 2) / 1) * 19, 80, 99);
  if (mesesCubiertos >= 1) return clamp(55 + ((mesesCubiertos - 1) / 1) * 24, 55, 79);
  if (mesesCubiertos >= 0.5) return clamp(30 + ((mesesCubiertos - 0.5) / 0.5) * 24, 30, 54);
  return clamp(mesesCubiertos * 60, 0, 29);
}

/**
 * Spending consistency: coefficient of variation of daily spending amounts.
 * Low CV → predictable, disciplined spending → higher score.
 * CV < 0.5 → 100, 0.5-1.0 → 70, 1.0-1.5 → 40, > 1.5 → 15
 */
function scoreConsistenciaGastos(cv: number): number {
  if (cv < 0.5) return 100;
  if (cv <= 1.0) return clamp(70 + ((1.0 - cv) / 0.5) * 29, 70, 99);
  if (cv <= 1.5) return clamp(40 + ((1.5 - cv) / 0.5) * 29, 40, 69);
  return clamp((2 - Math.min(cv, 2)) * 39, 0, 39);
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v =
    values.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, values.length);
  return { mean, std: Math.sqrt(v) };
}

export function calculateTransactionalScore(cartola: CartolaParseResult): TransactionalScoreResult {
  const dias = Math.max(1, cartola.periodo.dias);
  const saldos = cartola.saldos_diarios.map((d) => d.saldo);
  const saldoPromedio =
    saldos.length > 0 ? saldos.reduce((a, b) => a + b, 0) / saldos.length : cartola.saldo_final;

  const totalCargos = cartola.total_cargos;
  const gastoDiarioPromedio = totalCargos / dias;
  const ratioLiquidez =
    gastoDiarioPromedio > 0 ? saldoPromedio / gastoDiarioPromedio : saldoPromedio > 0 ? 100 : 0;

  const abonos = cartola.transacciones.filter((t) => t.tipo === "abono").map((t) => t.monto);
  const { mean: meanIngreso, std: stdIngreso } = meanStd(abonos);
  const cv = meanIngreso > 0 ? stdIngreso / meanIngreso : 0;

  const ingresosTotales = abonos.reduce((a, b) => a + b, 0) || 1;
  const gastosFijos = cartola.transacciones
    .filter((t) => t.tipo === "cargo" && t.es_pago_recurrente)
    .reduce((s, t) => s + t.monto, 0);
  const ratioGF = gastosFijos / ingresosTotales;

  const diasCriticos = cartola.saldos_diarios.filter((d) => d.saldo < CRITICO_CLP).length;

  const saldoIni = Math.max(1, cartola.saldo_inicial);
  const delta = (cartola.saldo_final - cartola.saldo_inicial) / saldoIni;

  // Emergency fund: balance / monthly expenses
  const mesesCubiertos = totalCargos > 0 ? saldoPromedio / totalCargos : (saldoPromedio > 0 ? 6 : 0);

  // Spending consistency: CV of daily cargo amounts
  const dailyAmounts = cartola.transacciones
    .filter((t) => t.tipo === "cargo")
    .map((t) => t.monto);
  const { std: stdGasto, mean: meanGasto } = meanStd(dailyAmounts);
  const cvGastos = meanGasto > 0 ? stdGasto / meanGasto : 0;

  // Weights redistributed across 7 factors (sum = 1.0)
  const w = {
    liquidez: 0.20,
    estabilidad_ingresos: 0.15,
    gastos_fijos: 0.15,
    dias_criticos: 0.15,
    tendencia: 0.10,
    fondo_emergencia: 0.15,
    consistencia_gastos: 0.10,
  };

  const sLiq = scoreLiquidez(ratioLiquidez);
  const sEst = scoreEstabilidadCv(cv);
  const sGF = scoreGastosFijosRatio(ratioGF);
  const sDc = scoreDiasCriticos(diasCriticos);
  const sTen = scoreTendencia(delta);
  const sFE = scoreFondoEmergencia(mesesCubiertos);
  const sCG = scoreConsistenciaGastos(cvGastos);

  const score =
    sLiq * w.liquidez +
    sEst * w.estabilidad_ingresos +
    sGF * w.gastos_fijos +
    sDc * w.dias_criticos +
    sTen * w.tendencia +
    sFE * w.fondo_emergencia +
    sCG * w.consistencia_gastos;

  const insights = buildInsights(cartola, {
    diasCriticos,
    ratioGF,
    gastoDiarioPromedio,
    saldoPromedio,
    ingresosTotales,
    mesesCubiertos,
    cvGastos,
  });

  return {
    score: Math.round(clamp(score, 0, 100)),
    subscores: {
      liquidez: Math.round(sLiq),
      estabilidad_ingresos: Math.round(sEst),
      gastos_fijos_sobre_ingresos: Math.round(sGF),
      dias_saldo_critico: Math.round(sDc),
      tendencia_ahorro: Math.round(sTen),
      fondo_emergencia: Math.round(sFE),
      consistencia_gastos: Math.round(sCG),
    },
    pesos: w,
    insights,
  };
}

function fmtMoney(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
}

function buildInsights(
  cartola: CartolaParseResult,
  ctx: {
    diasCriticos: number;
    ratioGF: number;
    gastoDiarioPromedio: number;
    saldoPromedio: number;
    ingresosTotales: number;
    mesesCubiertos: number;
    cvGastos: number;
  }
): string[] {
  const out: string[] = [];

  if (ctx.diasCriticos > 0) {
    out.push(
      `Tu saldo estuvo por debajo de $${fmtMoney(CRITICO_CLP)} durante ${ctx.diasCriticos} día(s) en el período analizado.`
    );
  }

  // Emergency fund insight
  if (ctx.mesesCubiertos < 1) {
    out.push(
      `Tu saldo promedio cubre menos de 1 mes de gastos. Intenta construir un colchón de al menos 3 meses para emergencias.`
    );
  } else if (ctx.mesesCubiertos >= 3) {
    out.push(
      `Tu fondo de emergencia cubre ${Math.round(ctx.mesesCubiertos * 10) / 10} meses de gastos — supera el mínimo recomendado de 3 meses.`
    );
  }

  // Spending consistency insight
  if (ctx.cvGastos > 1.5) {
    out.push(
      `Tus gastos son muy variables (dispersión alta). Establecer un presupuesto fijo por categoría puede ayudarte a controlar mejor.`
    );
  } else if (ctx.cvGastos < 0.5 && ctx.gastoDiarioPromedio > 0) {
    out.push(
      `Tus gastos son consistentes y predecibles, lo que facilita la planificación. ¡Sigue así!`
    );
  }

  const edu = cartola.transacciones.filter((t) => t.categoria === "educacion" && t.tipo === "cargo");
  const gastoEdu = edu.reduce((s, t) => s + t.monto, 0);
  if (gastoEdu > 0 && ctx.ingresosTotales > 0) {
    const pct = Math.round((gastoEdu / ctx.ingresosTotales) * 100);
    out.push(
      `Los pagos de educación sumaron $${fmtMoney(gastoEdu)} (${pct}% de tus ingresos). Verifica si aplicas a beneficios como CAE, Gratuidad o becas JUNAEB.`
    );
  }

  // Fixed expenses ratio
  if (ctx.ratioGF > 0.5) {
    out.push(
      `Tus gastos fijos representan el ${Math.round(ctx.ratioGF * 100)}% de tus ingresos. Renegociar planes o consolidar deudas podría bajar esa carga.`
    );
  }

  const alim = cartola.transacciones.filter((t) => t.categoria === "alimentacion" && t.tipo === "cargo");
  const gastoAlim = alim.reduce((s, t) => s + t.monto, 0);
  if (gastoAlim > 0 && ctx.ingresosTotales > 0) {
    const pct = Math.round((gastoAlim / ctx.ingresosTotales) * 100);
    out.push(`Tus gastos en alimentación fueron $${fmtMoney(gastoAlim)} (${pct}% de tus ingresos). Planificar comidas semanalmente puede reducir este gasto un 20-30%.`);
  }

  if (out.length === 0) {
    out.push(
      `Saldo promedio del período: $${fmtMoney(Math.round(ctx.saldoPromedio))}; gasto diario promedio: $${fmtMoney(Math.round(ctx.gastoDiarioPromedio))}.`
    );
  }

  return out.slice(0, 5);
}
