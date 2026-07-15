/**
 * Bank Notification Push Parser
 *
 * Parses text strings from Chilean bank push notifications
 * to extract transaction data (amount, merchant, date, card type).
 *
 * Supported banks: Santander, Banco de Chile, BCI, BancoEstado, Scotiabank
 *
 * Plan de transición: Until SFA APIs are fully transactional,
 * this parser enables expense automation from push notifications.
 */

import {
  classifyOperationCategory,
  mapExpenseCategoryToSfaCode,
  type SfaOperationCategory,
  type SfaOperationType,
} from "./sfaCodes.js";
import { categorizeExpense, type ExpenseCategorization } from "./expenseCategorizer.js";

export interface ParsedNotification {
  amount: number;
  merchant: string;
  date: string; // ISO format
  cardType: string; // 'debito' | 'credito' | 'cuenta_corriente' | 'cuenta_vista' | 'prepago'
  cardLastDigits?: string; // Last 4 digits
  bank: string;
  operationType: SfaOperationType;
  sfaProductCode: string; // SFA code (A001, B001, etc.)
  sfaOperationCategory: SfaOperationCategory;
  categorization: ExpenseCategorization;
  rawText: string;
  confidence: number; // 0-1
}

interface ParserPattern {
  bank: string;
  pattern: RegExp;
  extract: (match: RegExpMatchArray, raw: string) => Partial<ParsedNotification>;
}

const AMOUNT_REGEX = /\$?\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/;

function parseAmount(str: string): number {
  const cleaned = str.replace(/\$/g, "").replace(/\s/g, "");
  // Chilean format: dots as thousands separator, comma as decimal
  if (cleaned.includes(",") && cleaned.indexOf(",") > cleaned.lastIndexOf(".")) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  // If only dots, assume thousands separator
  if ((cleaned.match(/\./g) || []).length > 1) {
    return parseFloat(cleaned.replace(/\./g, ""));
  }
  if (cleaned.includes(".") && cleaned.split(".")[1]?.length === 3) {
    return parseFloat(cleaned.replace(/\./g, ""));
  }
  return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
}

function parseDate(dateStr: string): string {
  // DD/MM/YYYY or DD-MM-YYYY or DD/MM
  const match = dateStr.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!match) return new Date().toISOString();

  const day = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const year = match[3]
    ? parseInt(match[3]) < 100
      ? 2000 + parseInt(match[3])
      : parseInt(match[3])
    : new Date().getFullYear();

  return new Date(year, month, day).toISOString();
}

function detectCardType(text: string): string {
  const lower = text.toLowerCase();
  if (
    lower.includes("credito") ||
    lower.includes("crédito") ||
    lower.includes("tc ") ||
    lower.includes("t.c.")
  )
    return "credito";
  if (
    lower.includes("debito") ||
    lower.includes("débito") ||
    lower.includes("td ") ||
    lower.includes("t.d.")
  )
    return "debito";
  if (lower.includes("cuenta corriente") || lower.includes("cta cte") || lower.includes("cc "))
    return "cuenta_corriente";
  if (lower.includes("cuenta vista") || lower.includes("cta vista") || lower.includes("cv "))
    return "cuenta_vista";
  if (lower.includes("cuentarut") || lower.includes("cuenta rut")) return "cuenta_vista";
  if (lower.includes("prepago")) return "prepago";
  return "debito";
}

function extractLastDigits(text: string): string | undefined {
  const match = text.match(/\*{1,}(\d{4})/);
  if (match) return match[1];
  const termMatch = text.match(/termin[a-z]*\s*(?:en\s*)?(\d{4})/i);
  if (termMatch) return termMatch[1];
  return undefined;
}

/**
 * Parser patterns for Chilean banks
 */
const PATTERNS: ParserPattern[] = [
  // SANTANDER
  // "Compra por $12.500 en UBER *EATS con TC ****1234 el 10/03/2026"
  // "Compra $25.000 SUPERMERCADO LIDER con Débito ****5678"
  // "Transferencia enviada por $100.000 a JUAN PEREZ"
  {
    bank: "Santander",
    pattern:
      /(?:compra|cargo|pago)(?:\s+por)?\s+\$?\s*([\d.,]+)\s+(?:en\s+)?(.+?)(?:\s+con\s+(.+?))?(?:\s+el\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?))?$/i,
    extract: (match, raw) => ({
      amount: parseAmount(match[1]),
      merchant: match[2]?.trim().replace(/\s+/g, " ") || "Desconocido",
      date: match[4] ? parseDate(match[4]) : new Date().toISOString(),
      cardLastDigits: extractLastDigits(raw),
      operationType: "cargo",
    }),
  },
  // "Transferencia recibida $50.000 de MARIA GOMEZ"
  {
    bank: "Santander",
    pattern: /transferencia\s+(?:recibida|entrante)\s+\$?\s*([\d.,]+)\s+(?:de\s+)?(.+)/i,
    extract: (match) => ({
      amount: parseAmount(match[1]),
      merchant: match[2]?.trim() || "Transferencia",
      operationType: "abono",
    }),
  },
  // "Transferencia enviada $100.000 a JUAN PEREZ"
  {
    bank: "Santander",
    pattern: /transferencia\s+(?:enviada|saliente)\s+(?:por\s+)?\$?\s*([\d.,]+)\s+(?:a\s+)?(.+)/i,
    extract: (match) => ({
      amount: parseAmount(match[1]),
      merchant: match[2]?.trim() || "Transferencia",
      operationType: "cargo",
    }),
  },

  // BANCO DE CHILE
  // "Has realizado una compra por $15.000 en STARBUCKS con tu tarjeta terminada en 4567"
  // "Se ha realizado un cargo de $8.500 en tu cuenta corriente"
  {
    bank: "Banco de Chile",
    pattern:
      /(?:has\s+)?(?:realizado|hecho)\s+(?:una?\s+)?(?:compra|cargo|pago)\s+(?:por\s+)?\$?\s*([\d.,]+)\s+(?:en\s+)?(.+?)(?:\s+con\s+tu\s+tarjeta)?/i,
    extract: (match, raw) => ({
      amount: parseAmount(match[1]),
      merchant:
        match[2]
          ?.trim()
          .replace(/\s+con.*$/i, "")
          .replace(/\s+/g, " ") || "Desconocido",
      cardLastDigits: extractLastDigits(raw),
      operationType: "cargo",
    }),
  },
  // "Abono recibido por $200.000 en tu cuenta corriente"
  {
    bank: "Banco de Chile",
    pattern: /abono\s+(?:recibido\s+)?(?:por\s+)?\$?\s*([\d.,]+)\s+(?:en\s+)?(.+)/i,
    extract: (match) => ({
      amount: parseAmount(match[1]),
      merchant: match[2]?.trim() || "Abono",
      operationType: "abono",
    }),
  },

  // BCI
  // "Notificación BCI: Compra aprobada $32.000 FALABELLA TC *1234 10/03"
  // "BCI: Cargo $5.000 Netflix débito ****9876"
  {
    bank: "BCI",
    pattern:
      /(?:bci[:\s]+)?(?:compra\s+aprobada|cargo|pago)\s+\$?\s*([\d.,]+)\s+(.+?)(?:\s+(?:tc|td|débito|debito|credito|crédito)\s*)?(?:\*+\d{4})?(?:\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?))?$/i,
    extract: (match, raw) => ({
      amount: parseAmount(match[1]),
      merchant:
        match[2]
          ?.trim()
          .replace(/\s+(?:tc|td|débito|debito|credito|crédito).*$/i, "")
          .replace(/\s+/g, " ") || "Desconocido",
      date: match[3] ? parseDate(match[3]) : new Date().toISOString(),
      cardLastDigits: extractLastDigits(raw),
      operationType: "cargo",
    }),
  },

  // BANCOESTADO
  // "BancoEstado: Compra $7.990 en UBER con CuentaRUT"
  {
    bank: "BancoEstado",
    pattern:
      /(?:bancoestado[:\s]+)?(?:compra|cargo|pago)\s+\$?\s*([\d.,]+)\s+(?:en\s+)?(.+?)(?:\s+con\s+(.+))?$/i,
    extract: (match, raw) => ({
      amount: parseAmount(match[1]),
      merchant:
        match[2]
          ?.trim()
          .replace(/\s+con.*$/i, "")
          .replace(/\s+/g, " ") || "Desconocido",
      cardLastDigits: extractLastDigits(raw),
      operationType: "cargo",
    }),
  },

  // SCOTIABANK
  // "Scotia: Compra por $18.500 en SUPERMERCADO JUMBO TD ****3456"
  {
    bank: "Scotiabank",
    pattern:
      /(?:scotia(?:bank)?[:\s]+)?(?:compra|cargo|pago)\s+(?:por\s+)?\$?\s*([\d.,]+)\s+(?:en\s+)?(.+?)(?:\s+(?:tc|td))?(?:\s*\*+\d{4})?$/i,
    extract: (match, raw) => ({
      amount: parseAmount(match[1]),
      merchant:
        match[2]
          ?.trim()
          .replace(/\s+(?:tc|td).*$/i, "")
          .replace(/\s+/g, " ") || "Desconocido",
      cardLastDigits: extractLastDigits(raw),
      operationType: "cargo",
    }),
  },

  // GENERIC FALLBACK
  // "Compra $12.000 COMERCIO" or "$15.000 en TIENDA"
  {
    bank: "Desconocido",
    pattern: /(?:compra|cargo|pago|gasto)?\s*\$\s*([\d.,]+)\s+(?:en\s+)?(.+)/i,
    extract: (match, raw) => ({
      amount: parseAmount(match[1]),
      merchant: match[2]?.trim().replace(/\s+/g, " ") || "Desconocido",
      cardLastDigits: extractLastDigits(raw),
      operationType: "cargo",
    }),
  },
];

/**
 * Parse a bank push notification text into structured transaction data
 */
export function parseNotification(text: string): ParsedNotification | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const { bank, pattern, extract } of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const extracted = extract(match, trimmed);

      if (!extracted.amount || extracted.amount <= 0) continue;

      const cardType = detectCardType(trimmed);
      const merchantName = extracted.merchant || "Desconocido";
      const opCategory = classifyOperationCategory(trimmed);
      const sfaCode = mapExpenseCategoryToSfaCode(cardType, opCategory);
      const categorization = categorizeExpense(merchantName, extracted.amount);

      return {
        amount: extracted.amount,
        merchant: merchantName,
        date: extracted.date || new Date().toISOString(),
        cardType,
        cardLastDigits: extracted.cardLastDigits,
        bank,
        operationType: extracted.operationType || "cargo",
        sfaProductCode: sfaCode,
        sfaOperationCategory: opCategory,
        categorization,
        rawText: trimmed,
        confidence: bank === "Desconocido" ? 0.5 : 0.85,
      };
    }
  }

  // Last resort: try to find just an amount
  const amountMatch = trimmed.match(AMOUNT_REGEX);
  if (amountMatch) {
    const amount = parseAmount(amountMatch[1]);
    if (amount > 0) {
      return {
        amount,
        merchant: "Desconocido",
        date: new Date().toISOString(),
        cardType: "debito",
        bank: "Desconocido",
        operationType: "cargo",
        sfaProductCode: "A002",
        sfaOperationCategory: "otra",
        categorization: categorizeExpense("", amount),
        rawText: trimmed,
        confidence: 0.3,
      };
    }
  }

  return null;
}

/**
 * Parse multiple notifications (batch)
 */
export function parseNotifications(texts: string[]): ParsedNotification[] {
  return texts.map(parseNotification).filter((n): n is ParsedNotification => n !== null);
}
