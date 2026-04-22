/**
 * Detector de formato de cartola bancaria chilena.
 *
 * Evalúa el texto extraído del PDF contra patrones específicos por banco,
 * asignando un score de confianza de 0 a 1. Se requiere ≥ 0.85 para proceder
 * con el parseo; de lo contrario se lanza ParseError('FORMAT_UNKNOWN').
 */

import { ParseError, CONFIDENCE_THRESHOLD } from "./base.js";

export interface DetectedFormat {
  banco: string;
  confidence: number;
  markers: string[];
}

/**
 * Definición de patrones por banco.
 * - `patterns`: expresiones regulares a buscar en el texto del PDF.
 * - `weight`: factor de escala base (1.0 = banco mayor; 0.9 = banco de nicho).
 * - `requiredPattern` (opcional): si está presente, debe encontrarse para
 *   considerar al banco siquiera (evita falsos positivos por nombres comunes).
 */
const BANK_PATTERNS: Array<{
  banco: string;
  patterns: RegExp[];
  weight: number;
  requiredPattern?: RegExp;
}> = [
  {
    banco: "Santander",
    patterns: [
      /BANCO\s+SANTANDER/i,
      /\bSANTANDER\b/i,
      /santander\.cl/i,
      /ESTADO\s+DE\s+CUENTA\s+CORRIENTE\s+SANTANDER/i,
    ],
    weight: 1.0,
    requiredPattern: /\bSANTANDER\b/i,
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
 *  - Si `requiredPattern` no coincide → ese banco es descartado.
 *  - Primera coincidencia de pattern → confianza base = 0.70 × weight.
 *  - Cada coincidencia adicional → +0.10 (hasta 1.0 × weight).
 *  - Si el texto no tiene indicadores de cartola (CARGO, ABONO, etc.) → ×0.85.
 */
export function detectFormat(text: string): DetectedFormat {
  let bestBanco = "";
  let bestConfidence = 0;
  let bestMarkers: string[] = [];

  for (const bankDef of BANK_PATTERNS) {
    // Required pattern must match to consider this bank
    if (bankDef.requiredPattern && !bankDef.requiredPattern.test(text)) {
      continue;
    }

    const matchedPatterns: string[] = [];
    for (const pattern of bankDef.patterns) {
      if (pattern.test(text)) {
        matchedPatterns.push(pattern.source);
      }
    }
    if (matchedPatterns.length === 0) continue;

    const baseScore = 0.70 * bankDef.weight;
    const bonusScore =
      Math.min(0.30, (matchedPatterns.length - 1) * 0.10) * bankDef.weight;
    const confidence = baseScore + bonusScore;

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestBanco = bankDef.banco;
      bestMarkers = matchedPatterns;
    }
  }

  // Penalizar si el documento no parece una cartola de movimientos
  const hasTransactionContent =
    /CARGO|ABONO|TRANSACCI[OÓ]N|MOVIMIENTO|SALDO|DEP[ÓO]SITO|CHEQUE|CHEQUES/i.test(
      text
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
 * Lanza ParseError('FORMAT_UNKNOWN') si la confianza está por debajo del umbral.
 */
export function assertFormatDetected(detected: DetectedFormat): void {
  if (detected.confidence < CONFIDENCE_THRESHOLD) {
    throw new ParseError(
      "FORMAT_UNKNOWN",
      "No se reconoció el banco del documento. " +
        "Sube una cartola PDF de Santander, BCI, Banco de Chile, BancoEstado, Itaú o Scotiabank. " +
        "Si el PDF es una imagen escaneada, conviértelo a PDF con texto primero.",
      {
        detected_banco: detected.banco,
        confidence: detected.confidence,
        threshold: CONFIDENCE_THRESHOLD,
      }
    );
  }
}
