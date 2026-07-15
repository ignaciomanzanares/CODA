/**
 * Parser Santander.
 *
 * Santander usa un layout en columnas (CHEQUES Y CARGOS | DEPOSITOS Y ABONOS | SALDO)
 * detectado por coordenadas X de los ítems del PDF. Esto le da mayor confianza
 * de tipo cargo/abono que los parsers basados en secciones o keywords.
 */

import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const BANCO = "Santander";

export async function parse(buffer: Buffer, banco_confidence: number): Promise<ParseResult> {
  return runBankParser(buffer, {
    banco: BANCO,
    banco_confidence,
    mode: "column_based", // Santander's column layout → highest type confidence
  });
}
