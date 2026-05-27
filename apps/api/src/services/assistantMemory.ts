/**
 * Memoria cross-session del asistente IA: actualiza un resumen rolling
 * por usuario después de cada intercambio. Se invoca fire-and-forget desde
 * la ruta de chat para que NUNCA bloquee la respuesta al usuario.
 *
 * Trade-off conocido: hace una llamada extra al LLM por turno. En tier
 * gratuito (Groq/Gemini) esto consume rate-limit. Si llegamos al límite,
 * batchear (cada N intercambios) o usar un modelo más chico (llama-3.1-8b).
 */
import { storage } from "../storage.js";
import { logger } from "../logger.js";
import { simpleChat } from "./aiService.js";
import { invalidateAssistantContext } from "./assistantContext.js";

const MEMORY_SYSTEM_PROMPT = `Eres un proceso interno que mantiene el resumen de memoria de un usuario del asistente financiero CODA. NO interactúas con el usuario; solo generas texto que se guardará para uso futuro del asistente.

Reglas estrictas:
- Responde SOLO con el resumen actualizado, sin preámbulos, sin saludos, sin markdown.
- Máximo 200 palabras, en español chileno, texto plano.
- Captura: metas financieras (con plazos), productos/decisiones consultadas, preocupaciones recurrentes, hechos sobre la situación del usuario (ingreso aproximado, deudas, dependientes) que no estén ya en el resumen, preferencias de respuesta.
- NO incluyas datos sensibles (RUT, números de cuenta).
- NO inventes. Si el nuevo intercambio no aporta nada útil, devuelve el resumen anterior tal cual.
- Si el resumen crece, prioriza información reciente y consolida lo viejo en frases más cortas.`;

const MAX_SUMMARY_CHARS = 2000;
const MIN_MESSAGE_CHARS = 6;

// Lock en-memoria para evitar dos summarizaciones concurrentes del mismo usuario
// (race en el upsert, doble consumo de rate-limit).
const inflight = new Set<string>();

export async function updateAssistantSummary(
  userId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  if (!userId) return;
  if (userMessage.trim().length < MIN_MESSAGE_CHARS) return;
  if (assistantMessage.trim().length < MIN_MESSAGE_CHARS) return;
  if (inflight.has(userId)) return;

  inflight.add(userId);
  try {
    const existing = await storage.getAssistantSummary(userId);
    const prior = existing?.summary ?? "(nuevo usuario, sin historial previo)";
    const count = existing?.exchangeCount ?? 0;

    const userPrompt =
      `Resumen actual:\n${prior}\n\n` +
      `Nuevo intercambio:\n` +
      `Usuario: ${userMessage.slice(0, 800)}\n` +
      `Asistente: ${assistantMessage.slice(0, 1500)}\n\n` +
      `Devuelve el resumen actualizado.`;

    const raw = await simpleChat(MEMORY_SYSTEM_PROMPT, userPrompt);
    const newSummary = raw.trim().slice(0, MAX_SUMMARY_CHARS);
    if (!newSummary) return;

    await storage.upsertAssistantSummary(userId, {
      summary: newSummary,
      exchangeCount: count + 1,
    });

    // Invalidamos el cache de contexto para que el próximo turno lea el
    // resumen fresco (el cache vive 5 min — sin invalidar, el resumen
    // nuevo no llegaría al modelo hasta que expire).
    invalidateAssistantContext(userId);
  } catch (err) {
    logger.warn({ err, userId }, "updateAssistantSummary failed");
  } finally {
    inflight.delete(userId);
  }
}
