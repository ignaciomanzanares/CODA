import type { RatioDerivationInput, HealthEvaluationInput } from "./types.js";
import { effectiveAssetValueClp } from "../assets/types.js";
import { logger } from "../../logger.js";

/**
 * Deriva los 8 inputs del motor v2 a partir de los outputs de scoring existentes.
 * No re-parsea PDFs: consume lo que ya calcularon credit-score.ts y transactional-score.ts.
 */
export function deriveHealthInput(input: RatioDerivationInput): HealthEvaluationInput {
  const {
    ingresoMensualClp,
    deudaMensualClp,
    deudaTotalClp,
    ahorroMensualClp,
    cmf,
    sfaAvgMonthlyBalanceClp,
    sfaProductBalancesClp,
    userAssets = [],
  } = input;

  // ── Activos ───────────────────────────────────────────────────────────────
  // Preferencia: saldos reales SFA > balance anualizado > default 3 sueldos
  const liquidosClp =
    sfaProductBalancesClp ??
    (sfaAvgMonthlyBalanceClp != null ? sfaAvgMonthlyBalanceClp * 12 : ingresoMensualClp * 3);

  // Valor canónico por activo: estimatedValue ?? acquisitionCost. NUNCA se suman
  // ambas columnas del mismo activo (eso duplicaba la base y mostraba la mitad del ratio).
  const declaradosClp = userAssets.reduce((sum, a) => sum + effectiveAssetValueClp(a), 0);

  const activosClp = Math.max(liquidosClp + declaradosClp, 1);

  // ── Ratios principales ───────────────────────────────────────────────────
  const safeIngreso = Math.max(ingresoMensualClp, 1);
  const deudaFlujo = deudaMensualClp / safeIngreso;
  const deudaActivos = deudaTotalClp / activosClp;
  const ahorroIngreso = ahorroMensualClp / safeIngreso;

  // Debug verificable de Deuda/Activos: la deuda es el total CMF (sin sumar la
  // garantía); los activos son cada activo contado una sola vez + líquidos.
  logger.info(
    {
      total_debt: deudaTotalClp,
      total_assets: activosClp,
      liquidos_clp: liquidosClp,
      declarados_clp: declaradosClp,
      asset_count: userAssets.length,
      ratio_deuda_activos: Number(deudaActivos.toFixed(4)),
    },
    "health-evaluation: Deuda/Activos breakdown",
  );

  // ── Mora activa ──────────────────────────────────────────────────────────
  let diasMora = 0;
  for (const deuda of cmf.deuda_directa) {
    if (deuda.atraso_90_mas > 0) {
      diasMora = Math.max(diasMora, 90);
    } else if (deuda.atraso_60_89 > 0) {
      diasMora = Math.max(diasMora, 75);
    } else if (deuda.atraso_30_59 > 0) {
      diasMora = Math.max(diasMora, 45);
    }
  }
  const moraActiva = diasMora > 0;

  // ── Score interno ────────────────────────────────────────────────────────
  // historial_cmf viene de CreditScoreResult.componentes.historial_cmf (0–850)
  const historialCmfRaw = cmf.metricas.score_cmf * 8.5; // cmf score 0-100 → 0-850

  // Proxy antigüedad: sin fecha de inicio de crédito en parser actual.
  // 60 meses (5 años) si tiene líneas activas; 0 si sin historial.
  // TODO: mejorar cuando cmf-parser exponga fecha de origen de cada deuda.
  const antiguedadMeses = cmf.lineas_credito.length > 0 ? 60 : 0;

  const tiposCredito = new Set(cmf.deuda_directa.map((d) => d.tipo_credito)).size;

  return {
    deudaFlujo,
    deudaActivos,
    ahorroIngreso,
    moraActiva,
    diasMora,
    historialCmfRaw,
    antiguedadMeses,
    tiposCredito,
  };
}
