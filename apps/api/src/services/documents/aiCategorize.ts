/**
 * Fallback de categorización con IA para los movimientos que las reglas
 * deterministas NO pudieron clasificar ("otro"). El LLM conoce (o infiere) los
 * comercios chilenos y devuelve una categoría de NUESTRA taxonomía.
 *
 * Diseño:
 *  - Best-effort: si no hay proveedor de IA o falla, devuelve vacío → el
 *    movimiento simplemente queda "Sin categoría" (no empeora nada).
 *  - Solo se envía el STRING del comercio (ya está en la cartola); el llamador
 *    excluye transferencias a personas (PII de terceros).
 *  - Auditable: el resultado se persiste con ruleId "ai.suggested" (trazable) y
 *    confianza moderada → el usuario siempre puede corregirlo.
 */
import { simpleChat } from "../aiService.js";
import { logger } from "../../logger.js";

/** El fallback es tipo-aware: a un egreso le ofrece categorías de gasto, a un
 *  ingreso las fuentes de ingreso — nunca se mezclan. */
export type TxKind = "expense" | "income";

/** Categorías de GASTO/ahorro que la IA puede devolver para un egreso. */
const EXPENSE_ALLOWED = [
  "vivienda",
  "alimentacion",
  "transporte",
  "salud",
  "salud_bienestar",
  "cuidado_personal",
  "servicios_basicos",
  "servicios",
  "telecomunicaciones",
  "educacion",
  "seguros",
  "deudas",
  "restaurantes",
  "entretenimiento",
  "diversion",
  "hobbies",
  "suscripciones",
  "comercio",
  "regalos",
  "reparaciones",
  "imprevistos",
  "ahorros",
  "inversiones",
] as const;

/** Fuentes de INGRESO que la IA puede devolver para un abono. */
const INCOME_ALLOWED = [
  "ingreso_principal",
  "honorarios",
  "transferencia_recibida",
  "devoluciones",
  "rentas",
  "otros_ingresos",
] as const;

/** ruleId con el que se marcan las categorías puestas por IA (trazabilidad). */
export const AI_RULE_ID = "ai.suggested";
export const AI_CONFIDENCE = 0.6;

const EXPENSE_PROMPT = `Eres un categorizador de EGRESOS bancarios chilenos. Recibes un arreglo JSON de descripciones (glosas de cartola). Para cada una, elige EXACTAMENTE una categoría de esta lista (usa el slug tal cual):
${EXPENSE_ALLOWED.join(", ")}.
Guías: comercios de comida/cafés/bares → restaurantes; tiendas/retail/marketplace → comercio; apps de streaming/software → suscripciones; farmacias/clínicas → salud; supermercados → alimentacion; bencineras/uber/metro/estacionamiento → transporte; luz/agua/gas/internet → servicios_basicos. Si NO puedes determinarla con razonable certeza, usa "otro".
Responde SOLO un objeto JSON que mapee cada descripción EXACTA de entrada a su slug. Sin explicaciones, sin markdown.`;

const INCOME_PROMPT = `Eres un categorizador de INGRESOS bancarios chilenos. Recibes un arreglo JSON de descripciones (glosas de cartola), todas son ABONOS (dinero que entra). Para cada una, elige EXACTAMENTE una categoría de esta lista (usa el slug tal cual):
${INCOME_ALLOWED.join(", ")}.
Guías: sueldo/remuneración/liquidación → ingreso_principal; boletas de honorarios/trabajo independiente → honorarios; devoluciones de impuesto/SII/reintegros/reembolsos → devoluciones; arriendos/dividendos/intereses → rentas; transferencias recibidas de personas → transferencia_recibida; lo demás → otros_ingresos. Si NO puedes determinarla, usa "otro".
Responde SOLO un objeto JSON que mapee cada descripción EXACTA de entrada a su slug. Sin explicaciones, sin markdown.`;

/** Extrae el primer objeto JSON de una respuesta que puede venir con ```json … ```. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Clasifica descripciones no reconocidas por reglas. Devuelve un Map
 * descripcion→slug (solo las que la IA pudo ubicar; el resto se omite).
 * Nunca lanza: los errores se registran y devuelven lo que se haya logrado.
 */
export async function aiCategorizeDescriptions(
  descriptions: string[],
  kind: TxKind = "expense",
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(descriptions.map((d) => d.trim()).filter(Boolean))];
  if (uniq.length === 0) return out;

  const allowedSet = new Set<string>(kind === "income" ? INCOME_ALLOWED : EXPENSE_ALLOWED);
  const prompt = kind === "income" ? INCOME_PROMPT : EXPENSE_PROMPT;

  const BATCH = 40;
  const TIMEOUT_MS = 20_000; // un proveedor colgado no debe tumbar el recategorize
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH);
    try {
      const raw = await Promise.race([
        simpleChat(prompt, JSON.stringify(batch)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("ai timeout")), TIMEOUT_MS),
        ),
      ]);
      const obj = extractJsonObject(raw);
      if (!obj) continue;
      for (const [desc, val] of Object.entries(obj)) {
        const slug = String(val).trim().toLowerCase();
        if (allowedSet.has(slug) && slug !== "otro") out.set(desc, slug);
      }
    } catch (err) {
      logger.warn({ err, batchSize: batch.length }, "aiCategorize: batch falló (best-effort)");
    }
  }
  return out;
}
