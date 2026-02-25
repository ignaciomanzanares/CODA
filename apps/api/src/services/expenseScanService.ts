/**
 * Escaneo de recibos/tickets con Vision (Groq - Llama 4 Scout).
 * No requiere OpenAI; usa GROQ_API_KEY (mismo que el asistente financiero).
 */

import { logger } from "../logger.js";

const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transportation",
  "Housing",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Utilities",
  "Education",
  "Travel",
  "Other",
];

// Llama 3.2 90B Vision (Groq) - sin costo adicional con GROQ_API_KEY
const GROQ_VISION_MODEL = "llama-3.2-90b-vision-preview";

export interface ScanExpenseResult {
  amount: number;
  merchant: string;
  category: string;
  confidence: number;
}

export async function scanExpenseFromImage(imageBuffer: Buffer, mimeType: string): Promise<ScanExpenseResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.warn("GROQ_API_KEY not set, returning mock scan result");
    return {
      amount: 0,
      merchant: "Desconocido",
      category: "Other",
      confidence: 0.5,
    };
  }

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = `You are an expense receipt/ticket scanner. Look at this image and extract:
1. amount: the total amount to pay (number only, no currency symbol). If multiple amounts, use the total. Use numeric format (e.g. 15000 for 15.000 CLP).
2. merchant: the store, restaurant or business name (short, e.g. "Café Central").
3. category: one of exactly: ${CATEGORIES.join(", ")}.

Respond with ONLY a JSON object, no markdown, no explanation:
{"amount": number, "merchant": "string", "category": "CategoryName", "confidence": 0.0-1.0}

Confidence should reflect how clear the receipt is (0.9+ if amount and merchant are clearly visible).`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      max_tokens: 200,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error({ status: response.status, body: errText }, "Groq Vision API error");
    throw new Error(`Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty response from Vision API");
  }

  const parsed = JSON.parse(content.replace(/^```json?\s*|\s*```$/g, "")) as {
    amount?: number;
    merchant?: string;
    category?: string;
    confidence?: number;
  };

  const category = parsed.category && CATEGORIES.includes(parsed.category)
    ? parsed.category
    : "Other";
  const amount = typeof parsed.amount === "number" && parsed.amount >= 0 ? parsed.amount : 0;
  const merchant = typeof parsed.merchant === "string" ? parsed.merchant.trim() || "Desconocido" : "Desconocido";
  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.7;

  logger.info({ amount, merchant, category, confidence }, "Expense scan result (Groq Vision)");

  return { amount, merchant, category, confidence };
}
