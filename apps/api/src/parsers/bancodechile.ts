/**
 * Parser Banco de Chile (incluye Banco Edwards y Citi Chile).
 *
 * Banco de Chile separa movimientos en secciones "Cargos" y "Abonos".
 * Formato de saldo: "Saldo Anterior: $X" / "Saldo Final: $X".
 */

import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const BANCO = "Banco de Chile";

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
