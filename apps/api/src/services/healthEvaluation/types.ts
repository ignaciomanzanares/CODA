import type { UserAsset } from "../assets/types.js";
import type { CMFParseResult } from "../../parsers/cmf-parser.js";

export type HealthZone = "critica" | "intermedia";
export type HealthSalida =
  "ahorro_inversion" | "refinanciamiento" | "reestructuracion" | "concursal";
export type HealthLevel = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

export interface HealthEvaluationInput {
  /** Cuota mensual deuda / ingreso mensual (0–N; >0.50 = alerta) */
  deudaFlujo: number;
  /** Deuda total / activos totales (0–N; >0.80 = alerta; nunca negativo) */
  deudaActivos: number;
  /** Ahorro mensual / ingreso mensual (puede ser negativo si gasto > ingreso) */
  ahorroIngreso: number;
  moraActiva: boolean;
  /** Días del atraso más grave activo en CMF (0 si sin mora) */
  diasMora: number;
  /** 0–850 de CreditScoreResult.componentes.historial_cmf */
  historialCmfRaw: number;
  /** Proxy: lineas_credito.length * 12 (meses). Documentar limitación. */
  antiguedadMeses: number;
  /** Set(deuda_directa.map(d => d.tipo_credito)).size */
  tiposCredito: number;
}

export interface RecommendedProduct {
  productName: string;
  provider: string;
  category: string;
  matchScore: number;
  explanation: string;
}

export interface HealthEvaluationResult {
  nivel: HealthLevel;
  nivelNombre: string;
  zona: HealthZone;
  salida: HealthSalida;
  scoreRatios: number;
  scoreInterno: number;
  scoreCompuesto: number;
  nivelBruto: number;
  ratios: Pick<
    HealthEvaluationInput,
    "deudaFlujo" | "deudaActivos" | "ahorroIngreso" | "moraActiva" | "diasMora"
  >;
  productos: RecommendedProduct[];
  insights: string[];
}

export interface RatioDerivationInput {
  ingresoMensualClp: number;
  /** Proxy cuota mensual = cmf.deuda_total / 36. Reemplazar con dato real si disponible. */
  deudaMensualClp: number;
  deudaTotalClp: number;
  /** Ingreso mensual - gastos mensuales (puede ser negativo) */
  ahorroMensualClp: number;
  cmf: CMFParseResult;
  /** De SfaScoringResult.metrics.averageMonthlyBalanceClp (proxy de activos líquidos) */
  sfaAvgMonthlyBalanceClp?: number;
  /** Suma de saldos positivos de productos SFA vigentes (activos reales más precisos) */
  sfaProductBalancesClp?: number;
  /** Activos declarados manualmente por el usuario en el registro de activos */
  userAssets?: UserAsset[];
}
