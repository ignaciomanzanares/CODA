/**
 * Cartola (Bank Statement) PDF Parser → JSON Structured
 * 
 * Extends the existing cartola parser (pdfAnalysis.ts) to produce
 * SFA-compliant JSON mapped to our DB schema.
 * 
 * Flow: PDF Upload → Text Extraction → Parse Transactions → 
 *       Categorize → Map to SFA fields → Return structured JSON
 */

import { extractPdfText, parseCartolaPdf, type CartolaExtraida } from '../documents/pdfAnalysis.js';
import { categorizeExpense, type ExpenseCategorization } from './expenseCategorizer.js';
import { classifyOperationCategory, mapExpenseCategoryToSfaCode, type SfaOperationCategory, type SfaOperationType } from './sfaCodes.js';
import { logger } from '../../logger.js';

/**
 * A single structured movement from a cartola, ready for DB insertion
 */
export interface CartolaMovement {
  // Core fields (map to expenses table)
  date: string;                     // ISO format
  description: string;
  amount: number;                   // Always positive
  merchantName: string;
  category: string;
  subcategory?: string;
  paymentMethod: string;
  isAutoClassified: boolean;
  confidence: number;

  // SFA fields (NCG 514 compliant)
  sfaProductCode: string;
  sfaOperationCategory: SfaOperationCategory;
  sfaOperationType: SfaOperationType;
  moneda: string;

  // Original cartola data
  cargo: number;
  abono: number;
  saldo?: number;
}

/**
 * Complete structured output from cartola parsing
 */
export interface CartolaStructured {
  success: boolean;
  movimientos: CartolaMovement[];
  resumen: {
    totalCargos: number;
    totalAbonos: number;
    cantidadMovimientos: number;
    saldoInicial?: number;
    saldoFinal?: number;
    periodo?: string;
    categorias: Record<string, { count: number; total: number }>;
  };
  rawCartola?: CartolaExtraida;
}

function parseDateFromCartola(dateStr: string): string {
  // Try various date formats: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, YYYY-MM-DD
  const formats = [
    /(\d{2})[/-](\d{2})[/-](\d{4})/,   // DD/MM/YYYY
    /(\d{2})[/-](\d{2})[/-](\d{2})/,    // DD/MM/YY
    /(\d{4})-(\d{2})-(\d{2})/,          // YYYY-MM-DD (ISO)
  ];

  for (const fmt of formats) {
    const match = dateStr.match(fmt);
    if (match) {
      if (match[1].length === 4) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).toISOString();
      }
      const year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]);
      return new Date(year, parseInt(match[2]) - 1, parseInt(match[1])).toISOString();
    }
  }
  return new Date().toISOString();
}

function extractMerchantName(description: string): string {
  let cleaned = description
    .replace(/\d{2}[/-]\d{2}[/-]?\d{0,4}/g, '')   // Remove dates
    .replace(/\*{3,}\d{4}/g, '')                     // Remove card numbers
    .replace(/\b(TEF|PAC|PAT|CARGO|ABONO|COMPRA)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter of each word
  cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  return cleaned || description;
}

/**
 * Parse a cartola PDF buffer into structured JSON
 */
export async function parseCartolaPdfToJson(
  buffer: Buffer,
  paymentMethod: string = 'debito'
): Promise<CartolaStructured> {
  try {
    const { text, numPages } = await extractPdfText(buffer);

    if (!text || text.length < 50) {
      return {
        success: false,
        movimientos: [],
        resumen: {
          totalCargos: 0,
          totalAbonos: 0,
          cantidadMovimientos: 0,
          categorias: {},
        },
      };
    }

    const cartola = parseCartolaPdf(text);

    if (!cartola || cartola.transacciones.length === 0) {
      return {
        success: false,
        movimientos: [],
        resumen: {
          totalCargos: 0,
          totalAbonos: 0,
          cantidadMovimientos: 0,
          categorias: {},
        },
      };
    }

    const movimientos: CartolaMovement[] = [];
    const categorias: Record<string, { count: number; total: number }> = {};
    let totalCargos = 0;
    let totalAbonos = 0;

    for (const tx of cartola.transacciones) {
      const merchantName = extractMerchantName(tx.descripcion);
      const cat = categorizeExpense(merchantName, tx.cargo || tx.abono, tx.descripcion);
      const opCategory = classifyOperationCategory(tx.descripcion);
      const sfaCode = mapExpenseCategoryToSfaCode(paymentMethod, opCategory);
      const operationType: SfaOperationType = tx.cargo > 0 ? 'cargo' : 'abono';
      const amount = tx.cargo > 0 ? tx.cargo : tx.abono;

      totalCargos += tx.cargo;
      totalAbonos += tx.abono;

      if (!categorias[cat.category]) {
        categorias[cat.category] = { count: 0, total: 0 };
      }
      categorias[cat.category].count++;
      categorias[cat.category].total += amount;

      movimientos.push({
        date: parseDateFromCartola(tx.fecha),
        description: tx.descripcion,
        amount,
        merchantName,
        category: cat.category,
        subcategory: cat.subcategory,
        paymentMethod,
        isAutoClassified: true,
        confidence: cat.confidence,
        sfaProductCode: sfaCode,
        sfaOperationCategory: opCategory,
        sfaOperationType: operationType,
        moneda: 'CLP',
        cargo: tx.cargo,
        abono: tx.abono,
        saldo: tx.saldo,
      });
    }

    logger.info({
      movimientos: movimientos.length,
      totalCargos,
      totalAbonos,
    }, 'Cartola parsed successfully');

    return {
      success: true,
      movimientos,
      resumen: {
        totalCargos,
        totalAbonos,
        cantidadMovimientos: movimientos.length,
        saldoInicial: cartola.saldoInicial,
        saldoFinal: cartola.saldoFinal,
        categorias,
      },
      rawCartola: cartola,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to parse cartola PDF');
    return {
      success: false,
      movimientos: [],
      resumen: {
        totalCargos: 0,
        totalAbonos: 0,
        cantidadMovimientos: 0,
        categorias: {},
      },
    };
  }
}
