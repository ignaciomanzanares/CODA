/**
 * Dispatcher principal del sistema de parseo de cartolas bancarias chilenas.
 *
 * Flujo:
 *  1. Extraer texto del PDF (pdfjs → pdf-parse fallback).
 *  2. detectFormat() → banco + confianza.
 *  3. Si confianza < 0.85 → ParseError('FORMAT_UNKNOWN').
 *  4. Enrutar al parser del banco correspondiente.
 *  5. Parser añade confianza por transacción + conciliación de saldos.
 *  6. Retornar ParseResult o lanzar ParseError tipado.
 *
 * Exporta también el tipo ParseResult y la clase ParseError para que
 * los handlers de rutas puedan introspectarlos.
 */

import { detectFormat } from "./detectFormat.js";
import { ParseError, getDetectionTier } from "./base.js";
import type { ParseResult } from "./base.js";

import * as parsers from "./parsers.registry.js";

export { ParseError };
export type { ParseResult };
export type { ParseErrorCode } from "./base.js";

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parsea un buffer PDF de cartola bancaria chilena.
 *
 * @returns ParseResult con confianza por transacción, conciliación y advertencias.
 * @throws ParseError — con código tipado y mensaje en español.
 */
export async function parseCartolaBuffer(buffer: Buffer): Promise<ParseResult> {
  // 1. Extract text for format detection (lightweight — uses same pdfjs instance)
  const { extractPdfText } = await import(
    "../services/documents/pdfAnalysis.js"
  );
  let text = "";
  try {
    const result = await extractPdfText(buffer);
    text = result.text ?? "";
  } catch {
    /* will be caught by TEXT_EXTRACTION_FAILED in bankParser */
  }

  let numPages = 0;
  if (!text || text.trim().length < 40) {
    // Try pdf-parse as text-only fallback before giving up
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      text = data.text ?? "";
      numPages = data.numpages ?? 0;
    } catch {
      /* both failed */
    }
  }

  if (!text || text.trim().length < 40) {
    throw new ParseError(
      "TEXT_EXTRACTION_FAILED",
      "El PDF parece ser una imagen escaneada o un documento que no es una cartola bancaria (ej: escritura pública). Solo se aceptan cartolas bancarias en PDF con texto.",
      { text_length: text?.length ?? 0 }
    );
  }

  // 1b. Tarjeta de crédito Santander (nacional/internacional): mismo pipeline de
  // Movimientos, pero su layout no es de cuenta corriente — se detecta por el
  // discriminador del encabezado y se adapta a ParseResult antes de detectFormat.
  const { parseCardStatementText } = await import("./cardStatementAdapter.js");
  const card = await parseCardStatementText(text);
  if (card) return card;

  // Detect scanned/image PDFs or long legal documents with very little extractable text
  if (numPages > 3 && text.length / numPages < 100) {
    throw new ParseError(
      "TEXT_EXTRACTION_FAILED",
      "El PDF parece ser una imagen escaneada o un documento que no es una cartola bancaria (ej: escritura pública). Solo se aceptan cartolas bancarias en PDF con texto.",
      { text_length: text.length, numPages }
    );
  }

  // 2. Detect format and determine tier
  const detected = detectFormat(text);
  const tier = getDetectionTier(detected.confidence);

  if (tier === "LOW") {
    // #20: antes de rendirse, intentar el parser genérico por coordenadas (amplía cobertura a
    // formatos no reconocidos). Solo se acepta si pasa los gates de confianza/conciliación.
    const generic = await tryGenericParser(buffer);
    if (generic) return generic;
    throw new ParseError(
      "FORMAT_UNKNOWN",
      "No se reconoció el banco del documento. " +
        "Sube una cartola PDF de Santander, BCI, Banco de Chile, BancoEstado, Itaú o Scotiabank. " +
        "Si el PDF es una imagen escaneada, conviértelo a PDF con texto primero.",
      {
        detected_banco: detected.banco,
        confidence: detected.confidence,
        tier,
      }
    );
  }

  // 3. Route to bank-specific parser (PRIMARIO, mayor precisión cuando hay match)
  const parserFn = parsers.getParser(detected.banco);
  if (!parserFn) {
    // #20: banco detectado pero sin parser específico → fallback al parser genérico.
    const generic = await tryGenericParser(buffer);
    if (generic) return generic;
    throw new ParseError(
      "FORMAT_UNSUPPORTED",
      `El banco "${detected.banco}" fue detectado pero su parser no está implementado aún. ` +
        "Contacta a soporte para solicitar compatibilidad.",
      { banco: detected.banco, confidence: detected.confidence }
    );
  }

  return parserFn(buffer, detected.confidence);
}

/**
 * Intenta el parser genérico (#20). Devuelve el ParseResult si el motor compartido logra un
 * parseo con confianza/conciliación aceptables; `null` si lanza (formato realmente ilegible),
 * para que el caller conserve el ParseError original más informativo.
 */
async function tryGenericParser(buffer: Buffer): Promise<ParseResult | null> {
  try {
    const { parseGeneric } = await import("./genericParser.js");
    return await parseGeneric(buffer);
  } catch {
    return null;
  }
}
