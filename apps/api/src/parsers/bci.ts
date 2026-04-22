/**
 * Parser BCI.
 *
 * BCI organiza sus movimientos en secciones separadas:
 * "Cheques y Cargos del Período" y "Depósitos y Abonos del Período".
 * El parser de sección (section_based) identifica cada bloque y clasifica
 * todos los movimientos dentro de él como cargo o abono respectivamente.
 */

import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const BANCO = "BCI";

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
