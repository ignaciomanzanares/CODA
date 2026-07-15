/**
 * Motor compartido de parseo con confianza y conciliación.
 *
 * Toma la salida de los extractores existentes (cartola-parser + pdfAnalysis),
 * añade confianza por transacción y ejecuta la conciliación de saldos.
 * Cada parser por banco llama a `runBankParser()` con sus parámetros propios.
 */

import { parseCartolaPdfBuffer, type CartolaParseResult } from "./cartola-parser.js";
import { extractPdfText, type PdfLine } from "../services/documents/pdfAnalysis.js";
import pdfParse from "pdf-parse";
import {
  type ParseResult,
  type ParsedTransaction,
  type TransactionCategory,
  type ReconciliationResult,
  type DetectionTier,
  ParseError,
  buildTransactionConfidence,
  computeReconciliation,
  computeOverallConfidence,
  getDetectionTier,
  MIN_PARSE_CONFIDENCE,
  RECONCILIATION_ERROR_PCT,
} from "./base.js";
import { logger } from "../logger.js";

/** Parsing mode detected for the document — affects confidence scoring. */
export type ParsingMode = "column_based" | "section_based" | "keyword_inferred";

export interface BankParserOptions {
  /** Display name of the bank (already detected by detectFormat) */
  banco: string;
  /** Confidence of bank detection (0–1) */
  banco_confidence: number;
  /** Parsing mode for this bank's layout */
  mode: ParsingMode;
}

// ──────────────────────────────────────────────────────────────────────────────
// Text + line extraction (shared, identical to cartola-parser internals)
// ──────────────────────────────────────────────────────────────────────────────

async function extractTextAndLines(buffer: Buffer): Promise<{ text: string; lines: PdfLine[] }> {
  try {
    const result = await extractPdfText(buffer);
    const t = (result.text ?? "").trim();
    if (t.length >= 80) return { text: t, lines: result.lines };
  } catch {
    /* pdfjs failed — fall through to pdf-parse */
  }
  try {
    const data = await pdfParse(buffer);
    const t = (data.text ?? "").trim();
    if (t.length >= 80) return { text: t, lines: [] };
  } catch {
    /* both extractors failed */
  }
  return { text: "", lines: [] };
}

// ──────────────────────────────────────────────────────────────────────────────
// Confidence annotation
// ──────────────────────────────────────────────────────────────────────────────

const FALLBACK_DATE = new Date();

function isInferredDate(d: Date): boolean {
  // Heuristic: if the date matches today it was likely set as a fallback
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function annotateTransaction(
  tx: CartolaParseResult["transacciones"][number],
  mode: ParsingMode,
): ParsedTransaction {
  const typeFromColumn = mode === "column_based";
  const typeFromSection = mode === "section_based";

  const confidence = buildTransactionConfidence({
    dateIsInferred: isInferredDate(tx.fecha),
    amountFromColumn: typeFromColumn,
    monto: tx.monto,
    typeFromColumn,
    typeFromSection,
    descripcion: tx.descripcion,
  });

  return {
    fecha: tx.fecha,
    descripcion: tx.descripcion,
    tipo: tx.tipo,
    monto: tx.monto,
    saldo_despues: tx.saldo_despues,
    categoria: tx.categoria as TransactionCategory,
    es_transferencia: tx.es_transferencia,
    es_compra: tx.es_compra,
    es_pago_recurrente: tx.es_pago_recurrente,
    confidence,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Observability log
// ──────────────────────────────────────────────────────────────────────────────

function logParserAttempt(opts: {
  banco: string;
  banco_confidence: number;
  mode: ParsingMode;
  tx_count: number;
  parse_confidence: number;
  reconciliation: ReconciliationResult;
  warnings: string[];
}): void {
  logger.info(
    {
      parser_attempt: {
        banco: opts.banco,
        banco_confidence: opts.banco_confidence,
        mode: opts.mode,
        tx_count: opts.tx_count,
        parse_confidence: opts.parse_confidence,
        reconciliation_passed: opts.reconciliation.passed,
        reconciliation_delta_pct: opts.reconciliation.delta_pct,
        reconciliation_skipped: opts.reconciliation.skipped,
        warning_count: opts.warnings.length,
      },
    },
    "parser_attempt",
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry point for all bank parsers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parsea un buffer PDF de cartola bancaria, añade confianza por transacción,
 * ejecuta la conciliación de saldos y devuelve un ParseResult completo.
 *
 * @throws {ParseError} TEXT_EXTRACTION_FAILED — el PDF no tiene texto extraíble.
 * @throws {ParseError} NO_TRANSACTIONS — el parser no encontró transacciones.
 * @throws {ParseError} LOW_CONFIDENCE — confianza global < MIN_PARSE_CONFIDENCE.
 * @throws {ParseError} BALANCE_MISMATCH — delta de conciliación > RECONCILIATION_ERROR_PCT.
 */
export async function runBankParser(buffer: Buffer, opts: BankParserOptions): Promise<ParseResult> {
  // 1. Text extraction guard
  const { text } = await extractTextAndLines(buffer);
  if (!text || text.length < 40) {
    throw new ParseError(
      "TEXT_EXTRACTION_FAILED",
      "No se pudo extraer texto del PDF. " +
        "Es posible que sea una imagen escaneada. " +
        "Exporta la cartola directamente desde el sitio del banco (PDF digital, no escaneado).",
      { text_length: text?.length ?? 0 },
    );
  }

  // 2. Parse using the existing engine (handles bank detection, enrichment, etc.)
  const raw: CartolaParseResult = await parseCartolaPdfBuffer(buffer);

  // 3. No transactions guard
  if (!raw.transacciones || raw.transacciones.length === 0) {
    throw new ParseError(
      "NO_TRANSACTIONS",
      "El parser leyó el PDF pero no encontró movimientos. " +
        "Verifica que la cartola tenga al menos una transacción en el período, " +
        "o descarga el PDF desde el sitio web del banco (no desde una app móvil).",
      { banco: opts.banco },
    );
  }

  // 4. Annotate each transaction with confidence scores
  const tier: DetectionTier = getDetectionTier(opts.banco_confidence);
  const rawTransacciones: ParsedTransaction[] = raw.transacciones.map((tx) =>
    annotateTransaction(tx, opts.mode),
  );

  // When MEDIUM tier: multiply each transaction's confidence by banco_confidence
  // to propagate detection uncertainty into the transaction-level scores.
  const transacciones: ParsedTransaction[] =
    tier === "MEDIUM"
      ? rawTransacciones.map((tx) => ({
          ...tx,
          confidence: {
            ...tx.confidence,
            overall: Math.round(tx.confidence.overall * opts.banco_confidence * 1000) / 1000,
          },
        }))
      : rawTransacciones;

  // 5. Reconciliation
  const reconciliation = computeReconciliation(
    raw.saldo_inicial,
    raw.saldo_final,
    raw.total_cargos,
    raw.total_abonos,
  );

  // 6. Overall parse confidence
  const parse_confidence = computeOverallConfidence(transacciones);

  // 7. Build warnings list
  const warnings: string[] = [];

  if (parse_confidence < 0.65) {
    warnings.push("La confianza de extracción es baja — revisa manualmente los montos y fechas.");
  }

  if (!reconciliation.skipped && !reconciliation.passed) {
    warnings.push(
      `Los saldos no cuadran (diferencia ${reconciliation.delta_pct}%). ` +
        "Puede haber transacciones parciales o un período incompleto.",
    );
  }

  // Warn if many transactions have low type confidence
  const lowTypeTxs = transacciones.filter((tx) => tx.confidence.type < 0.8).length;
  if (lowTypeTxs > transacciones.length * 0.3) {
    warnings.push(
      "Más del 30% de los movimientos tienen clasificación cargo/abono incierta. " +
        "Considera revisar el tipo de movimiento manualmente.",
    );
  }

  // 8. Observability log
  logParserAttempt({
    banco: opts.banco,
    banco_confidence: opts.banco_confidence,
    mode: opts.mode,
    tx_count: transacciones.length,
    parse_confidence,
    reconciliation,
    warnings,
  });

  // 9. Hard-fail checks (after logging so we capture the attempt)
  if (parse_confidence < MIN_PARSE_CONFIDENCE) {
    throw new ParseError(
      "LOW_CONFIDENCE",
      `La confianza global del parseo es muy baja (${Math.round(parse_confidence * 100)}%). ` +
        "Es posible que el formato del PDF no sea compatible. " +
        "Descarga la cartola directamente desde el portal web del banco.",
      { parse_confidence, banco: opts.banco },
    );
  }

  if (!reconciliation.skipped && reconciliation.delta_pct > RECONCILIATION_ERROR_PCT) {
    throw new ParseError(
      "BALANCE_MISMATCH",
      `Los saldos no cuadran con las transacciones (diferencia del ${reconciliation.delta_pct}%). ` +
        "Es posible que la cartola esté incompleta o tenga páginas faltantes.",
      {
        delta_pct: reconciliation.delta_pct,
        expected_final: reconciliation.expected_final,
        actual_final: reconciliation.actual_final,
      },
    );
  }

  return {
    banco: opts.banco,
    banco_confidence: opts.banco_confidence,
    detection_tier: tier,
    titular: raw.titular,
    cuenta: raw.cuenta,
    periodo: raw.periodo,
    saldo_inicial: raw.saldo_inicial,
    saldo_final: raw.saldo_final,
    total_cargos: raw.total_cargos,
    total_abonos: raw.total_abonos,
    transacciones,
    saldos_diarios: raw.saldos_diarios,
    reconciliation,
    parse_confidence,
    warnings,
  };
}
