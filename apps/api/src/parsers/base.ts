/**
 * Tipos compartidos para el sistema de parseo de documentos financieros chilenos.
 *
 * Cada resultado de parseo incluye:
 *  - Confianza por transacción (fecha, monto, tipo, descripción)
 *  - Resultado de conciliación de saldos
 *  - Confianza global del documento
 *  - Lista de advertencias
 */

// ──────────────────────────────────────────────────────────────────────────────
// Error codes
// ──────────────────────────────────────────────────────────────────────────────

export type ParseErrorCode =
  /** Banco no detectado con confianza suficiente (< 0.85) */
  | "FORMAT_UNKNOWN"
  /** Banco reconocido pero sin parser implementado */
  | "FORMAT_UNSUPPORTED"
  /** El PDF no tiene texto extraíble (posible PDF de imagen) */
  | "TEXT_EXTRACTION_FAILED"
  /** El parser corrió pero no encontró transacciones */
  | "NO_TRANSACTIONS"
  /** La conciliación de saldos falló (delta > 5%) */
  | "BALANCE_MISMATCH"
  /** Confianza global del parseo demasiado baja (< 0.40) */
  | "LOW_CONFIDENCE"
  /** Sin tipo de cambio USD→CLP disponible (TC internacional; reintentable) */
  | "FX_UNAVAILABLE";

export class ParseError extends Error {
  public readonly code: ParseErrorCode;
  public readonly messageEs: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: ParseErrorCode, messageEs: string, details?: Record<string, unknown>) {
    super(messageEs);
    this.name = "ParseError";
    this.code = code;
    this.messageEs = messageEs;
    this.details = details;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Transaction types
// ──────────────────────────────────────────────────────────────────────────────

export type TransactionCategory =
  | "educacion"
  | "alimentacion"
  | "transporte"
  | "telecomunicaciones"
  | "transferencia_enviada"
  | "transferencia_recibida"
  | "comercio"
  | "entretenimiento"
  | "restaurantes"
  | "salud"
  | "ingreso_principal"
  | "otro";

/**
 * Confianza por dimensión para una transacción individual.
 *
 * Ponderación: date×0.20 + amount×0.30 + type×0.30 + description×0.20
 */
export interface TransactionConfidence {
  /** 1.0 = fecha completa DD/MM/YYYY; 0.7 = año inferido; 0.6 = fecha de respaldo */
  date: number;
  /** 1.0 = monto en columna; 0.85 = CLP con separadores; 0.6 = monto sospechosamente pequeño */
  amount: number;
  /** 1.0 = columna; 0.90 = sección; 0.75 = keyword; 0.50 = tipo inferido */
  type: number;
  /** 1.0 = descripción rica; 0.75 = corta; 0.50 = casi numérica */
  description: number;
  /** Promedio ponderado de las cuatro dimensiones */
  overall: number;
}

export interface ParsedTransaction {
  fecha: Date;
  descripcion: string;
  tipo: "cargo" | "abono";
  monto: number;
  saldo_despues: number;
  categoria: TransactionCategory;
  es_transferencia: boolean;
  es_compra: boolean;
  es_pago_recurrente: boolean;
  confidence: TransactionConfidence;
  /** TC internacional: monto USD nativo + tasa, para conservar metadata al normalizar. */
  montoUsd?: number;
  fxRate?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reconciliation
// ──────────────────────────────────────────────────────────────────────────────

export interface ReconciliationResult {
  /** saldo_inicial + total_abonos − total_cargos ≈ saldo_final (tolerancia ≤ 1%) */
  passed: boolean;
  expected_final: number;
  actual_final: number;
  /** |delta| / max(|saldo_final|, 1) × 100 */
  delta_pct: number;
  /** true cuando saldo_inicial y saldo_final son ambos 0 (desconocidos) */
  skipped: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// ParseResult
// ──────────────────────────────────────────────────────────────────────────────

export interface ParseResult {
  banco: string;
  banco_confidence: number;
  /** Tier de detección del banco: HIGH (≥0.90) | MEDIUM (0.70–0.89) | LOW (<0.70) */
  detection_tier: DetectionTier;
  titular: string;
  cuenta: string;
  periodo: { desde: Date; hasta: Date; dias: number };
  saldo_inicial: number;
  saldo_final: number;
  total_cargos: number;
  total_abonos: number;
  transacciones: ParsedTransaction[];
  saldos_diarios: Array<{ fecha: Date; saldo: number }>;
  reconciliation: ReconciliationResult;
  parse_confidence: number;
  warnings: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Detection tiers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Nivel de confianza de detección del banco.
 * - HIGH  (≥ 0.90): parseo silencioso
 * - MEDIUM (0.70–0.89): parseo + banner de revisión en UI; confianza de transacciones
 *   multiplicada por banco_confidence para propagar la incertidumbre
 * - LOW   (< 0.70): rechaza con FORMAT_UNKNOWN
 */
export type DetectionTier = "HIGH" | "MEDIUM" | "LOW";

/** Umbral mínimo para el tier HIGH */
export const HIGH_TIER_THRESHOLD = 0.9;

/** Umbral mínimo para el tier MEDIUM (por debajo = LOW → FORMAT_UNKNOWN) */
export const MEDIUM_TIER_THRESHOLD = 0.7;

/** @deprecated Usar HIGH_TIER_THRESHOLD / MEDIUM_TIER_THRESHOLD con getDetectionTier() */
export const CONFIDENCE_THRESHOLD = 0.85;

/** Devuelve el tier a partir de la confianza de detección. */
export function getDetectionTier(confidence: number): DetectionTier {
  if (confidence >= HIGH_TIER_THRESHOLD) return "HIGH";
  if (confidence >= MEDIUM_TIER_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/** Confianza global mínima aceptable para devolver un resultado sin error */
export const MIN_PARSE_CONFIDENCE = 0.4;

/** Tolerancia máxima de conciliación de saldos (%) antes de generar advertencia */
export const RECONCILIATION_WARN_PCT = 1.0;

/** Tolerancia máxima de conciliación de saldos (%) antes de lanzar error */
export const RECONCILIATION_ERROR_PCT = 5.0;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Calcula el resultado de conciliación de saldos. */
export function computeReconciliation(
  saldo_inicial: number,
  saldo_final: number,
  total_cargos: number,
  total_abonos: number,
): ReconciliationResult {
  // Si ambos saldos son 0, asumimos que son desconocidos — saltamos la conciliación.
  if (saldo_inicial === 0 && saldo_final === 0) {
    return {
      passed: true,
      expected_final: 0,
      actual_final: 0,
      delta_pct: 0,
      skipped: true,
    };
  }
  const expected_final = saldo_inicial + total_abonos - total_cargos;
  const delta = Math.abs(expected_final - saldo_final);
  const denominator = Math.max(Math.abs(saldo_final), 1);
  const delta_pct = Math.round((delta / denominator) * 1000) / 10; // 1 decimal
  return {
    passed: delta_pct <= RECONCILIATION_WARN_PCT,
    expected_final: Math.round(expected_final),
    actual_final: Math.round(saldo_final),
    delta_pct,
    skipped: false,
  };
}

/** Construye la confianza por transacción y calcula overall. */
export function buildTransactionConfidence(opts: {
  dateIsInferred: boolean;
  amountFromColumn: boolean;
  monto: number;
  typeFromColumn: boolean;
  typeFromSection: boolean;
  descripcion: string;
}): TransactionConfidence {
  const date = opts.dateIsInferred ? 0.65 : 0.95;

  let amount: number;
  if (opts.amountFromColumn) {
    amount = 0.97;
  } else if (opts.monto <= 0) {
    amount = 0.1;
  } else if (opts.monto < 100) {
    amount = 0.6; // < 100 CLP is suspiciously small
  } else if (opts.monto % 100 === 0 || opts.monto % 10 === 0) {
    amount = 0.9; // Round CLP amount is normal
  } else {
    amount = 0.85;
  }

  let type: number;
  if (opts.typeFromColumn) {
    type = 0.95;
  } else if (opts.typeFromSection) {
    type = 0.88;
  } else {
    type = 0.75;
  }

  const descLetters = (opts.descripcion.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]/g) ?? []).length;
  let description: number;
  if (descLetters >= 6 && opts.descripcion.length >= 10) {
    description = 1.0;
  } else if (descLetters >= 3 && opts.descripcion.length >= 4) {
    description = 0.75;
  } else {
    description = 0.5;
  }

  const overall =
    Math.round((date * 0.2 + amount * 0.3 + type * 0.3 + description * 0.2) * 1000) / 1000;

  return { date, amount, type, description, overall };
}

/** Promedio de confianza de todas las transacciones (0 si ninguna). */
export function computeOverallConfidence(txs: ParsedTransaction[]): number {
  if (txs.length === 0) return 0;
  const sum = txs.reduce((acc, tx) => acc + tx.confidence.overall, 0);
  return Math.round((sum / txs.length) * 1000) / 1000;
}
