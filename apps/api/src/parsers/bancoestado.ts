/**
 * Parser BancoEstado.
 *
 * BancoEstado (incluyendo CuentaRUT) mezcla cargos y abonos en una lista
 * cronológica sin secciones separadas. El motor cae en modo keyword_inferred,
 * que usa las glosas de las transacciones para determinar el tipo.
 */

import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const BANCO = "BancoEstado";

export async function parse(
  buffer: Buffer,
  banco_confidence: number
): Promise<ParseResult> {
  return runBankParser(buffer, {
    banco: BANCO,
    banco_confidence,
    mode: "keyword_inferred",
  });
}
