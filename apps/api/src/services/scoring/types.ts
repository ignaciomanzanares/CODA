/**
 * Tipos de entrada y salida del motor de Score Transaccional SFA.
 * Alineado con Business plan CODA: perfil de riesgo medible y verificable.
 * Cumplimiento CMF: minimización (solo campos necesarios para el score).
 */

import type { SfaTransaccion, SfaProductoVigente, SfaProductCode } from '../../sfa/types.js';
import type { ExchangeRatesToClp } from './currency.js';

export interface SfaScoringInput {
  /** Transacciones SFA (historia de uso; ventana típica 12 meses, actualización diaria). */
  transactions: SfaTransaccion[];
  /** Productos vigentes del cliente a fecha de consulta. */
  products: SfaProductoVigente[];
  /**
   * Tasas de cambio a CLP según MSI (tabla 1). Si no se envían, se usan tasas base internas.
   * Permite inyectar tasas oficiales/diarias en producción.
   */
  exchangeRates?: ExchangeRatesToClp;
}

/** Resultado del Score Transaccional: score 0-100, insights y productos recomendados. */
export interface SfaScoringResult {
  /** Puntuación transaccional 0-100 (mayor = mejor perfil). */
  transactionalScore: number;
  /** Insights principales para el usuario y para auditoría del perfil. */
  mainInsights: string[];
  /** Códigos SFA de productos recomendados (ej. C001 crédito consumo más barato). */
  recommendedProducts: SfaProductCode[];
  /** Detalle opcional para diagnóstico y mejora del perfil. Sin datos sensibles (principio de minimización). */
  metrics?: {
    /** Saldo promedio mensual en CLP (ventana 12 meses, según norma posiciones históricas). */
    averageMonthlyBalanceClp?: number;
    /** Meses con al menos un abono en los últimos 12 (estabilidad de ingresos). */
    monthsWithAbonos?: number;
    /** Meses de la ventana sin movimientos (gap): se propagó último saldo conocido. */
    monthsWithGap?: number;
    /** Ratio uso línea sobregiro 0-1 (cuentas con línea). */
    overdraftUsageRatio?: number;
    /** Indica si se detectó saldo en cuenta y deuda en tarjeta (optimización). */
    hasOptimizationOpportunity?: boolean;
  };
}
