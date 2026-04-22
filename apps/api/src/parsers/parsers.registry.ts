/**
 * Registro de parsers por banco.
 * Añadir un banco nuevo = importarlo aquí y registrarlo en REGISTRY.
 */

import type { ParseResult } from "./base.js";
import { parse as parseSantander } from "./santander.js";
import { parse as parseBci } from "./bci.js";
import { parse as parseBancoDeChile } from "./bancodechile.js";
import { parse as parseBancoEstado } from "./bancoestado.js";
import { parse as parseItau } from "./itau.js";
import { parse as parseScotiabank } from "./scotiabank.js";

type ParserFn = (buffer: Buffer, banco_confidence: number) => Promise<ParseResult>;

const REGISTRY: Record<string, ParserFn> = {
  Santander: parseSantander,
  BCI: parseBci,
  "Banco de Chile": parseBancoDeChile,
  BancoEstado: parseBancoEstado,
  "Itaú": parseItau,
  Scotiabank: parseScotiabank,
};

/** Returns the parser function for a bank, or undefined if unsupported. */
export function getParser(banco: string): ParserFn | undefined {
  return REGISTRY[banco];
}

/** List of all supported bank names. */
export const SUPPORTED_BANKS = Object.keys(REGISTRY);
