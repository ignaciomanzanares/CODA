/**
 * Detector de formato de cartola bancaria chilena.
 *
 * Evalúa el texto extraído del PDF contra patrones específicos por banco,
 * asignando un score de confianza de 0 a 1.
 *
 * Sistema de tres niveles (tiers):
 *  - HIGH  (≥ 0.90): parseo silencioso
 *  - MEDIUM (0.70–0.89): parseo + banner de revisión en la UI
 *  - LOW   (< 0.70): rechaza con FORMAT_UNKNOWN
 */

import { ParseError, getDetectionTier } from "./base.js";
export type { DetectionTier } from "./base.js";

export interface DetectedFormat {
  banco: string;
  confidence: number;
  markers: string[];
}

/**
 * Normaliza el texto del PDF antes de la detección:
 *  1. Colapsa texto con caracteres separados por espacios ("B A N C O" → "BANCO")
 *  2. Colapsa espacios múltiples a uno solo.
 *
 * Algunos extractores de PDF separan cada letra del texto del logo del banco
 * con espacios individuales, lo que rompe los patrones de palabra completa.
 */
function normalizeForDetection(text: string): string {
  // Collapse sequences of single uppercase letters separated by single spaces
  // e.g. "B A N C O  S A N T A N D E R" → "BANCO  SANTANDER"
  // Pattern: letter, space, letter, space... (≥ 3 chars total)
  let normalized = text.replace(
    /(?<![A-Za-zÁÉÍÓÚÑáéíóúñ])([A-ZÁÉÍÓÚÑ] ){2,}[A-ZÁÉÍÓÚÑ](?![A-Za-zÁÉÍÓÚÑáéíóúñ])/g,
    (m) => m.replace(/ /g, "")
  );

  // Collapse multiple spaces/tabs to single space
  normalized = normalized.replace(/[ \t]{2,}/g, " ");

  return normalized;
}

/**
 * Denylist: bloques de texto marketing/promo a ignorar antes de evaluar señales.
 * Elimina líneas que claramente son publicidad o textos legales genéricos para
 * evitar que palabras como "ESTADO" (en "ESTADO DE BIENESTAR") interfieran.
 */
function stripDenylistedBlocks(text: string): string {
  // Remove lines that look like generic disclaimer boilerplate
  // (very long lines with no numeric content)
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    // Keep lines with numeric content or short lines
    if (trimmed.length < 120) return true;
    if (/\d/.test(trimmed)) return true;
    // Long lines with only uppercase (common in marketing banners)
    if (/^[A-ZÁÉÍÓÚÑ\s",.!?-]{100,}$/.test(trimmed)) return false;
    return true;
  });
  return filtered.join("\n");
}

/**
 * Definición de patrones por banco.
 * - `patterns`: expresiones regulares a buscar en el texto del PDF.
 * - `weight`: factor de escala base (1.0 = banco mayor; 0.9 = banco de nicho).
 * - `requiredPattern` (opcional): si está presente, debe encontrarse para
 *   considerar al banco siquiera (evita falsos positivos por nombres comunes).
 * - `strongSignals` (opcional): si ≥2 de estas señales coinciden, la confianza
 *   se eleva a un mínimo de 0.92 (HIGH tier garantizado).
 */
const BANK_PATTERNS: Array<{
  banco: string;
  patterns: RegExp[];
  weight: number;
  requiredPattern?: RegExp;
  strongSignals?: RegExp[];
}> = [
  {
    banco: "Santander",
    patterns: [
      // Bank name signals
      /BANCO\s+SANTANDER/i,
      /\bSANTANDER\b/i,
      /santander\.cl/i,
      /ESTADO\s+DE\s+CUENTA\s+CORRIENTE\s+SANTANDER/i,
      /Banco\s+Santander\s+Chile/i,
      // Column header signals — unique to Santander's PDF layout
      /CHEQUES\s+(?:Y\s+)?(?:OTROS\s+)?CARGOS/i,
      /DEP[OÓ]SITOS?\s+(?:Y\s+)?(?:OTROS\s+)?ABONOS?/i,
      // Balance section headers
      /Saldo\s+Inicial/i,
      /Saldo\s+Final/i,
      // Regulatory footer (CMF reference appears on every Santander statement)
      /\bCMF\b|cmfchile\.cl/i,
      // Account type headers
      /CUENTA\s+VISTA|CUENTA\s+CORRIENTE|SUPER\s+CTA\s+VISTA/i,
    ],
    weight: 1.0,
    // Accept SANTANDER text OR Santander structural column headers as gate
    requiredPattern:
      /\bSANTANDER\b|Banco\s+Santander|CHEQUES\s+(?:Y\s+)?(?:OTROS\s+)?CARGOS/i,
    // Strong-signal boost: 2+ of these → floor confidence at 0.92
    strongSignals: [
      /BANCO\s+SANTANDER/i,
      /Banco\s+Santander\s+Chile/i,
      /\bCMF\b|cmfchile\.cl/i,
      /CHEQUES\s+(?:Y\s+)?(?:OTROS\s+)?CARGOS/i,
      /DEP[OÓ]SITOS?\s+(?:Y\s+)?(?:OTROS\s+)?ABONOS?/i,
    ],
  },
  {
    banco: "BCI",
    patterns: [
      /\bBCI\b/,
      /BANCO\s+DE\s+CR[ÉE]DITO\s+E\s+INVERSIONES/i,
      /bci\.cl/i,
      /CARTOLA\s+BCI/i,
      /CUENTA\s+CORRIENTE\s+BCI/i,
    ],
    weight: 1.0,
    requiredPattern: /\bBCI\b/,
  },
  {
    banco: "Banco de Chile",
    patterns: [
      /BANCO\s+DE\s+CHILE/i,
      /\bEDWARDS\b/i,
      /bancochile\.cl/i,
      /\bCITI\b.*BANCO/i,
      /BANCO\s+DE\s+CHILE.*CARTOLA/i,
    ],
    weight: 1.0,
    requiredPattern: /BANCO\s+DE\s+CHILE/i,
  },
  {
    banco: "BancoEstado",
    patterns: [
      /BANCOESTADO/i,
      /BANCO\s+ESTADO/i,
      /bancoestado\.cl/i,
      /CUENTA\s*RUT\b/i,
      /CARTOLA\s+BANCOESTADO/i,
    ],
    weight: 1.0,
    requiredPattern: /BANCOESTADO|BANCO\s+ESTADO/i,
  },
  {
    banco: "Itaú",
    patterns: [
      /\bITAU\b/i,
      /\bIT[ÁA]U\b/i,
      /itau\.cl/i,
      /BANCO\s+ITAU\b/i,
      /CARTOLA\s+IT[ÁA]U/i,
    ],
    weight: 1.0,
    requiredPattern: /ITAU|IT[ÁA]U/i,
  },
  {
    banco: "Scotiabank",
    patterns: [
      /\bSCOTIABANK\b/i,
      /\bSCOTIA\b/i,
      /scotiabank\.cl/i,
      /CARTOLA\s+SCOTIABANK/i,
    ],
    weight: 1.0,
    requiredPattern: /SCOTIABANK|SCOTIA/i,
  },
  {
    banco: "BICE",
    patterns: [
      /\bBANCO\s+BICE\b/i,
      /\bBICE\b/,
      /bice\.cl/i,
    ],
    weight: 0.9,
    requiredPattern: /\bBICE\b/,
  },
  {
    banco: "Security",
    patterns: [
      /BANCO\s+SECURITY/i,
      /bancosecurity\.cl/i,
      /CARTOLA\s+SECURITY/i,
    ],
    weight: 0.9,
    requiredPattern: /BANCO\s+SECURITY/i,
  },
];

/**
 * Detecta el banco del documento y calcula la confianza de la detección.
 *
 * Algoritmo:
 *  1. Normaliza el texto (colapsa caracteres espaciados, espacios múltiples).
 *  2. Elimina bloques denylistados (marketing/boilerplate) antes de evaluar.
 *  3. Si `requiredPattern` no coincide → ese banco es descartado.
 *  4. Primera coincidencia de pattern → confianza base = 0.70 × weight.
 *  5. Cada coincidencia adicional → +0.10 (hasta 1.0 × weight).
 *  6. Strong-signal boost: si ≥ 2 `strongSignals` coinciden → conf ≥ 0.92.
 *  7. Si el texto no tiene indicadores de cartola (CARGO, ABONO, etc.) → ×0.85.
 */
export function detectFormat(text: string): DetectedFormat {
  // Step 1: Normalize
  const normalizedText = normalizeForDetection(stripDenylistedBlocks(text));

  let bestBanco = "";
  let bestConfidence = 0;
  let bestMarkers: string[] = [];
  let bestStrongMatches = 0;
  let bestBankDef: (typeof BANK_PATTERNS)[number] | undefined;

  for (const bankDef of BANK_PATTERNS) {
    // Required pattern must match to consider this bank
    if (bankDef.requiredPattern && !bankDef.requiredPattern.test(normalizedText)) {
      continue;
    }

    const matchedPatterns: string[] = [];
    for (const pattern of bankDef.patterns) {
      if (pattern.test(normalizedText)) {
        matchedPatterns.push(pattern.source);
      }
    }
    if (matchedPatterns.length === 0) continue;

    const baseScore = 0.70 * bankDef.weight;
    const bonusScore =
      Math.min(0.30, (matchedPatterns.length - 1) * 0.10) * bankDef.weight;
    let confidence = baseScore + bonusScore;

    // Count strong signals for this bank
    const strongMatches = (bankDef.strongSignals ?? []).filter((re) =>
      re.test(normalizedText)
    ).length;

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestBanco = bankDef.banco;
      bestMarkers = matchedPatterns;
      bestStrongMatches = strongMatches;
      bestBankDef = bankDef;
    }
  }

  // Strong-signal boost: if ≥ 2 strong signals matched → floor confidence at 0.92
  if (bestBankDef?.strongSignals && bestStrongMatches >= 2) {
    bestConfidence = Math.max(bestConfidence, 0.92);
  }

  // Penalizar si el documento no parece una cartola de movimientos
  const hasTransactionContent =
    /CARGO|ABONO|TRANSACCI[OÓ]N|MOVIMIENTO|SALDO|DEP[ÓO]SITO|CHEQUE|CHEQUES/i.test(
      normalizedText
    );
  if (!hasTransactionContent && bestConfidence > 0) {
    bestConfidence *= 0.85;
  }

  return {
    banco: bestBanco || "Desconocido",
    confidence: Math.round(bestConfidence * 100) / 100,
    markers: bestMarkers,
  };
}

/**
 * Lanza ParseError('FORMAT_UNKNOWN') si la confianza está en el nivel LOW (< 0.70).
 * Para nivel MEDIUM (0.70–0.89) y HIGH (≥ 0.90) no lanza error.
 */
export function assertFormatDetected(detected: DetectedFormat): void {
  const tier = getDetectionTier(detected.confidence);
  if (tier === "LOW") {
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
}
