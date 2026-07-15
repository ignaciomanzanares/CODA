/**
 * Parser Scotiabank Chile.
 *
 * Scotiabank presenta un estado de cuenta con secciones de cargos y abonos,
 * similar al formato BCI. El modo section_based identifica cada bloque
 * por sus encabezados ("Cargos del Período", "Abonos del Período").
 */

import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const BANCO = "Scotiabank";

export async function parse(buffer: Buffer, banco_confidence: number): Promise<ParseResult> {
  return runBankParser(buffer, {
    banco: BANCO,
    banco_confidence,
    mode: "section_based",
  });
}
