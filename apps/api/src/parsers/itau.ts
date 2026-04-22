/**
 * Parser Itaú Chile.
 *
 * Itaú presenta movimientos con columnas de Débito y Crédito,
 * aunque la detección de columnas X puede no activarse si los
 * headers difieren de Santander. Usa sección como modo de respaldo.
 */

import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const BANCO = "Itaú";

export async function parse(
  buffer: Buffer,
  banco_confidence: number
): Promise<ParseResult> {
  return runBankParser(buffer, {
    banco: BANCO,
    banco_confidence,
    mode: "section_based",
  });
}
