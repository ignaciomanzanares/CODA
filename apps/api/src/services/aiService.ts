/**
 * Asistente financiero IA de CODA.
 * Soporta Groq, Gemini, Anthropic y OpenAI con streaming SSE y respuestas estructuradas.
 * Prioriza proveedores gratuitos (Groq → Gemini) sobre pagos (Anthropic → OpenAI).
 */
import { logger } from "../logger.js";
import { TOOL_DEFINITIONS, executeTool, type ToolCall } from "./aiTools.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  // OpenAI/Groq tool-calling extensions:
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// Eventos emitidos por las generadoras de streaming.
// Los chunks de texto se yieldean como string (el caso común). Las herramientas
// emiten `tool_start`/`tool_end` para que la UI pueda mostrar "Consultando…"
// mientras se ejecuta una tool call (que de otro modo sería una pausa muda).
export type StreamEvent = string | { type: "tool_start" | "tool_end"; name: string };

const MAX_TOOL_ITERATIONS = 3;

export interface FinancialContext {
  totalBalance?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  savingsRate?: number;
  netWorth?: number;
  creditScore?: number;
  topSpendingCategories?: { name: string; amount: number }[];
  recentTransactions?: { description: string; amount: number; category: string; date?: string }[];
  financialGoals?: { name: string; progress: number }[];
  debts?: { type: string; balance: number; rate?: number }[];
  accountSummary?: { checking: number; savings: number; credit: number; investment: number };
  /** Resumen rolling de conversaciones pasadas con este usuario (memoria persistente). */
  userSummary?: string;
}

export interface ActionItem {
  title: string;
  description: string;
  link?: string;
  icon?: string;
}

export interface AIResponse {
  message: string;
  suggestions?: string[];
  actionItems?: ActionItem[];
}

// ── Provider configuration ───────────────────────────────────────────────────

type AIProvider = "groq" | "gemini" | "anthropic" | "openai";

const getApiKeyFor = (provider: AIProvider): string | undefined => {
  switch (provider) {
    case "groq":
      return process.env.GROQ_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
  }
};

// Cadena ordenada de proveedores que tienen clave configurada (gratis primero).
// Permite tolerancia a fallos: si Groq rate-limitea (común en su tier gratis),
// caemos a Gemini, luego Anthropic, luego OpenAI antes de fallar.
/**
 * Whitelist de proveedores autorizados a recibir datos (#6): si `AI_AUTHORIZED_PROVIDERS` está
 * seteada (CSV, p.ej. "anthropic,openai"), solo esos proveedores entran a la cadena —los demás se
 * excluyen aunque tengan API key. Sin la variable, no se restringe (compatibilidad). Pensado para
 * limitar el envío de datos a proveedores con DPA firmado.
 */
const getAuthorizedProviders = (): Set<AIProvider> | null => {
  const raw = process.env.AI_AUTHORIZED_PROVIDERS?.trim();
  if (!raw) return null;
  const allowed = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean) as AIProvider[];
  return new Set(allowed);
};

export const getProviderChain = (): AIProvider[] => {
  const order: AIProvider[] = ["groq", "gemini", "anthropic", "openai"];
  const authorized = getAuthorizedProviders();
  return order.filter((p) => !!getApiKeyFor(p)).filter((p) => !authorized || authorized.has(p));
};

const GEMINI_MODEL = "gemini-2.0-flash";

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres **CODA AI**, asistente financiero de CODA (app chilena de finanzas personales). Experto en el sistema financiero chileno: AFP y multifondos, CAE, UF, CMF (tasa máxima convencional ~36% anual en consumo), impuestos (renta, boletas con retención 13.75%, PPM), productos (cuentas vista tipo Cuenta RUT/MACH/Tenpo, créditos consumo e hipotecarios, fondos mutuos, depósitos a plazo), bancos locales (BancoEstado, Chile, Santander, BCI, Scotiabank, Itaú, Falabella) y subsidios (DS1/DS49, IFE, bono marzo).

## Personalidad
Cercano, directo y empático — como un amigo que sabe de plata. Español chileno natural ("cachai", "lucas" si el usuario es informal). Honesto, no endulzas malas noticias. Siempre con números concretos, no generalidades.

## Rutas de CODA (recomiéndalas cuando aporten)
- /panel → score crediticio, patrimonio neto, resumen
- /gastos → registro y análisis por categoría
- /movimientos → transacciones bancarias sincronizadas
- /metas → metas de ahorro con seguimiento
- /productos → marketplace con productos financieros comparados
- /plan → plan financiero personalizado
- /dividir-cuenta → gastos compartidos
- /conexiones → sincronizar cuentas vía Open Finance

## Formato
Markdown plano (sin JSON, sin bloques de código). **Negritas** para montos/%/plazos. Viñetas con \`-\` (máx 5). Montos en CLP formato $XXX.XXX.

SIEMPRE responde con contenido — incluso un "hola" merece un saludo cordial breve + invitación a preguntar algo concreto. Para preguntas sustantivas: 2-4 párrafos, sin abrir con relleno tipo "Claro" o "Por supuesto".

Termina con una línea en blanco y exactamente esta línea (formato fijo):
PREGUNTAS: pregunta uno | pregunta dos | pregunta tres

Las 3 preguntas son lo que **el usuario podría querer preguntarte a continuación** — NO preguntas que tú le haces al usuario. En primera persona del usuario, p. ej. "¿Cómo puedo ahorrar más?", "Analiza mis gastos del mes", "¿Qué tarjeta me conviene?". Nunca uses "¿Cuánto quieres…?", "¿Cuál es tu meta?" ni similares (esas son tuyas, no del usuario). Máx 60 caracteres c/u. Nada después de esta línea.

## Herramientas
Las herramientas (query_transactions, simulate_loan) solo cuando el usuario pide datos específicos o cálculos numéricos concretos. NO las uses para saludos, definiciones, ni preguntas generales — responde directo con tu conocimiento y el contexto financiero ya cargado.

## Reglas de CODA (obligatorias — cumplimiento CMF)
- **Regla anti-predatoria:** si el usuario está sobreendeudado (cuotas > 50% del ingreso mensual, o deuda mayor que su patrimonio), NUNCA recomiendes tomar crédito nuevo. Orienta a reestructuración, reducción de gastos o, si hay insolvencia, a mecanismos legales de alivio de deuda (Ley de Reorganización y Liquidación). Esto está por sobre cualquier otra recomendación.
- **Neutralidad:** ordena y recomienda productos por el beneficio neto para el usuario, JAMÁS por lo que le conviene a CODA. CODA gana solo cuando el usuario contrata algo que realmente le sirve.
- **No inventes:** no inventes tasas, montos, plazos ni productos. Usa el contexto financiero cargado y las herramientas para datos reales. Si no tienes el dato, dilo claramente.
- **Escala de salud (−2 a +5):** ubica al usuario en su nivel real y adapta el consejo: a quien está en −2/−1 lo ayudas a salir de la deuda; a quien está en 0/+1 lo ayudas a estabilizar y ahorrar; a +2 o más, a invertir y optimizar.

## Seguridad
No compartas RUT completo ni datos sensibles. Si no tienes el dato, dilo. No des asesoría tributaria específica (recomienda contador). Ante deuda crítica, sé empático y sugiere ayuda profesional.`;

// ── Context builder (Spanish) ────────────────────────────────────────────────

function fmtClp(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

/**
 * Anonimización de montos para la IA (#6): en vez del monto exacto, devuelve el RANGO al que
 * pertenece. Reduce lo que se filtra a proveedores externos manteniendo señal suficiente para el
 * consejo financiero ("estás en el rango $1M–$2M de ingresos"). Los límites son fijos y de
 * magnitud creciente; el signo se conserva (deudas/cargos negativos).
 */
const CLP_BUCKETS = [
  0, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000,
  100_000_000, 200_000_000, 500_000_000,
];
function fmtClpRange(n: number): string {
  const a = Math.abs(Math.round(n));
  const sign = n < 0 ? "-" : "";
  for (let i = 0; i < CLP_BUCKETS.length - 1; i++) {
    if (a >= CLP_BUCKETS[i] && a < CLP_BUCKETS[i + 1]) {
      return `${sign}${fmtClp(CLP_BUCKETS[i])}–${fmtClp(CLP_BUCKETS[i + 1])}`;
    }
  }
  return `${sign}más de ${fmtClp(CLP_BUCKETS[CLP_BUCKETS.length - 1])}`;
}

/** Anonimizar el payload a la IA está activo por defecto (#6); apagar con AI_ANONYMIZE_PAYLOAD=false. */
function aiAnonymizeEnabled(): boolean {
  return process.env.AI_ANONYMIZE_PAYLOAD !== "false";
}

export function buildContextPrompt(
  context: FinancialContext,
  opts?: { anonymize?: boolean },
): string {
  const parts: string[] = [];
  // #6: por defecto se anonimiza el payload antes de enviarlo a cualquier proveedor de IA —
  // rangos en vez de montos exactos, y sin las descripciones (glosas) de las transacciones.
  const anonymize = opts?.anonymize ?? aiAnonymizeEnabled();
  const money = (n: number): string => (anonymize ? fmtClpRange(n) : fmtClp(n));

  if (context.userSummary && context.userSummary.trim().length > 0) {
    parts.push("## Lo que recuerdas del usuario (conversaciones pasadas)");
    parts.push(context.userSummary.trim());
    parts.push("");
  }

  parts.push("## Datos financieros del usuario (últimos ~30 días)");
  if (anonymize) {
    parts.push("_(Montos en rangos por privacidad; usa los rangos para tu consejo.)_");
  }

  if (context.accountSummary) {
    const s = context.accountSummary;
    parts.push("\n### Cuentas");
    if (s.checking) parts.push(`- Cuenta corriente/vista: ${money(s.checking)}`);
    if (s.savings) parts.push(`- Ahorro: ${money(s.savings)}`);
    if (s.credit) parts.push(`- Deuda tarjetas crédito: ${money(s.credit)}`);
    if (s.investment) parts.push(`- Inversiones: ${money(s.investment)}`);
  }

  if (context.totalBalance) {
    parts.push(`- Balance total: ${money(context.totalBalance)}`);
  }

  parts.push("\n### Flujo mensual");
  if (context.monthlyIncome) {
    parts.push(`- Ingresos mensuales: ${money(context.monthlyIncome)}`);
  }
  if (context.monthlyExpenses) {
    parts.push(`- Gastos mensuales: ${money(context.monthlyExpenses)}`);
  }
  if (context.savingsRate != null) {
    parts.push(`- Tasa de ahorro: ${context.savingsRate}%`);
  }
  if (context.netWorth) {
    parts.push(`- Patrimonio neto: ${money(context.netWorth)}`);
  }
  if (context.creditScore) {
    parts.push(`- Score crediticio CODA: ${context.creditScore}/850`);
  }

  if (context.topSpendingCategories && context.topSpendingCategories.length > 0) {
    parts.push("\n### Principales categorías de gasto");
    for (const cat of context.topSpendingCategories.slice(0, 5)) {
      if (!cat) continue;
      parts.push(`- ${cat.name ?? "Otro"}: ${money(cat.amount)}/mes`);
    }
  }

  if (context.debts && context.debts.length > 0) {
    parts.push("\n### Deudas");
    for (const d of context.debts) {
      const rate = d.rate ? ` (tasa ${d.rate}%)` : "";
      parts.push(`- ${d.type}: ${money(d.balance)}${rate}`);
    }
  }

  if (context.recentTransactions && context.recentTransactions.length > 0) {
    parts.push("\n### Últimas transacciones");
    for (const t of context.recentTransactions.slice(0, 8)) {
      const dateStr = t.date ? ` (${t.date})` : "";
      // #6: en modo anónimo se omite la glosa (`description`) — solo categoría + rango.
      const label = anonymize ? t.category || "movimiento" : t.description;
      parts.push(`- ${label}: ${money(t.amount)}${anonymize ? "" : ` [${t.category}]`}${dateStr}`);
    }
  }

  if (context.financialGoals && context.financialGoals.length > 0) {
    parts.push("\n### Metas financieras");
    for (const goal of context.financialGoals) {
      parts.push(`- ${goal.name}: ${goal.progress}% completado`);
    }
  }

  return parts.join("\n");
}

// ── Provider implementations ─────────────────────────────────────────────────

async function callOpenAI(messages: Message[], apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

async function callAnthropic(messages: Message[], apiKey: string): Promise<string> {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemMessage,
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "";
}

// Gemini usa un esquema distinto: system_instruction separado, rol "model" en
// vez de "assistant", y tool calls como `functionCall`/`functionResponse` parts.
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function toGeminiContents(messages: Message[]): {
  system_instruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
} {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            /* keep empty */
          }
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      // Gemini espera el resultado como un user message con functionResponse.
      // El name lo guardamos en m.name al momento de ejecutar la tool.
      let response: Record<string, unknown>;
      try {
        const parsed = JSON.parse(m.content);
        response = parsed && typeof parsed === "object" ? parsed : { content: m.content };
      } catch {
        response = { content: m.content };
      }
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name || "unknown", response } }],
      });
    }
  }

  return {
    system_instruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
    contents,
  };
}

function geminiToolsPayload(): unknown {
  return [
    {
      function_declarations: TOOL_DEFINITIONS.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

async function callGemini(messages: Message[], apiKey: string): Promise<string> {
  const { system_instruction, contents } = toGeminiContents(messages);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction,
      contents,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.4 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p: { text?: string }) => p.text || "").join("");
}

// Bucle agéntico para Gemini (no-streaming).
async function callGeminiWithToolLoop(
  messages: Message[],
  apiKey: string,
  userId: string,
): Promise<string> {
  const working = [...messages];
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const isLast = i === MAX_TOOL_ITERATIONS - 1;
    const { system_instruction, contents } = toGeminiContents(working);
    const body: Record<string, unknown> = {
      system_instruction,
      contents,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.4 },
    };
    if (!isLast) body.tools = geminiToolsPayload();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);

    const data = await response.json();
    const parts: GeminiPart[] = data.candidates?.[0]?.content?.parts ?? [];

    let text = "";
    const fnCalls: { name: string; args: Record<string, unknown> }[] = [];
    for (const p of parts) {
      if (typeof p.text === "string") text += p.text;
      if (p.functionCall) {
        fnCalls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
      }
    }

    if (fnCalls.length === 0) return text;

    const toolCalls: ToolCall[] = fnCalls.map((c, idx) => ({
      id: `gemini_${i}_${idx}`,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    }));
    working.push({ role: "assistant", content: text, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const out = await executeTool(tc.function.name, tc.function.arguments, userId);
      working.push({ role: "tool", content: out, tool_call_id: tc.id, name: tc.function.name });
    }
  }
  return "";
}

// Serializa nuestro Message extendido al formato de wire de OpenAI/Groq.
// Necesario porque ahora soportamos `tool_calls` (asistente) y rol `tool`.
function toOpenAIWireMessage(m: Message): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: m.role,
    content: m.content ?? "",
  };
  if (m.tool_calls && m.tool_calls.length > 0) out.tool_calls = m.tool_calls;
  if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
  if (m.name) out.name = m.name;
  return out;
}

interface GroqMessageResult {
  content: string;
  tool_calls?: ToolCall[];
}

async function callGroq(
  messages: Message[],
  apiKey: string,
  opts: { withTools?: boolean } = {},
): Promise<GroqMessageResult> {
  const body: Record<string, unknown> = {
    model: "llama-3.3-70b-versatile",
    messages: messages.map(toOpenAIWireMessage),
    max_tokens: 1500,
    temperature: 0.4,
  };
  if (opts.withTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = "auto";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const data = await response.json();
  const msg = data.choices?.[0]?.message ?? {};
  return { content: msg.content ?? "", tool_calls: msg.tool_calls };
}

// Bucle agéntico no-streaming: el modelo puede pedir herramientas hasta
// MAX_TOOL_ITERATIONS veces; en la última iteración se llama sin tools para
// forzar una respuesta textual final.
async function callGroqWithToolLoop(
  messages: Message[],
  apiKey: string,
  userId: string,
): Promise<string> {
  const working = [...messages];
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const isLast = i === MAX_TOOL_ITERATIONS - 1;
    const result = await callGroq(working, apiKey, { withTools: !isLast });

    if (!isLast && result.tool_calls && result.tool_calls.length > 0) {
      working.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.tool_calls,
      });
      for (const tc of result.tool_calls) {
        const out = await executeTool(tc.function.name, tc.function.arguments, userId);
        working.push({ role: "tool", content: out, tool_call_id: tc.id, name: tc.function.name });
      }
      continue;
    }

    return result.content;
  }
  return "";
}

// ── Streaming implementations ────────────────────────────────────────────────

export async function* streamOpenAI(
  messages: Message[],
  apiKey: string,
): AsyncGenerator<StreamEvent> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.4,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        /* skip malformed chunks */
      }
    }
  }
}

export async function* streamAnthropic(
  messages: Message[],
  apiKey: string,
): AsyncGenerator<StreamEvent> {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      stream: true,
      system: systemMessage,
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      } catch {
        /* skip */
      }
    }
  }
}

export async function* streamGemini(
  messages: Message[],
  apiKey: string,
): AsyncGenerator<StreamEvent> {
  const { system_instruction, contents } = toGeminiContents(messages);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction,
      contents,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.4 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);
        const parts = parsed.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (typeof p?.text === "string" && p.text) yield p.text;
          }
        }
      } catch {
        /* skip malformed chunks */
      }
    }
  }
}

// Variante streaming agéntica para Gemini.
export async function* streamGeminiWithTools(
  messages: Message[],
  apiKey: string,
  userId: string,
): AsyncGenerator<StreamEvent> {
  const working = [...messages];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const isLast = iter === MAX_TOOL_ITERATIONS - 1;
    const { system_instruction, contents } = toGeminiContents(working);
    const body: Record<string, unknown> = {
      system_instruction,
      contents,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.4 },
    };
    if (!isLast) body.tools = geminiToolsPayload();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    const fnCalls: { name: string; args: Record<string, unknown> }[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          const parts: GeminiPart[] | undefined = parsed.candidates?.[0]?.content?.parts;
          if (!Array.isArray(parts)) continue;
          for (const p of parts) {
            if (typeof p?.text === "string" && p.text) {
              assistantText += p.text;
              yield p.text;
            }
            if (p?.functionCall) {
              fnCalls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
            }
          }
        } catch {
          /* skip malformed chunks */
        }
      }
    }

    if (fnCalls.length === 0) return;

    const toolCalls: ToolCall[] = fnCalls.map((c, idx) => ({
      id: `gemini_${iter}_${idx}`,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    }));
    working.push({ role: "assistant", content: assistantText, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      yield { type: "tool_start", name: tc.function.name };
      const out = await executeTool(tc.function.name, tc.function.arguments, userId);
      yield { type: "tool_end", name: tc.function.name };
      working.push({ role: "tool", content: out, tool_call_id: tc.id, name: tc.function.name });
    }
  }
}

export async function* streamGroq(
  messages: Message[],
  apiKey: string,
): AsyncGenerator<StreamEvent> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.4,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        /* skip */
      }
    }
  }
}

// Variante streaming agéntica para Groq: yields chunks de texto al usuario
// pero entre stream y stream ejecuta tool calls de forma transparente.
// Solo el texto final llega al cliente; las herramientas son invisibles
// (la UI verá una pausa mientras se ejecutan).
export async function* streamGroqWithTools(
  messages: Message[],
  apiKey: string,
  userId: string,
): AsyncGenerator<StreamEvent> {
  const working = [...messages];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const isLast = iter === MAX_TOOL_ITERATIONS - 1;
    const body: Record<string, unknown> = {
      model: "llama-3.3-70b-versatile",
      messages: working.map(toOpenAIWireMessage),
      max_tokens: 1500,
      temperature: 0.4,
      stream: true,
    };
    if (!isLast) {
      body.tools = TOOL_DEFINITIONS;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallsByIndex = new Map<number, ToolCall>();
    let assistantText = "";
    let finishReason: string | null = null;

    streamLoop: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") break streamLoop;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};

          if (typeof delta.content === "string" && delta.content) {
            assistantText += delta.content;
            yield delta.content;
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const d of delta.tool_calls) {
              const idx = typeof d.index === "number" ? d.index : 0;
              const existing = toolCallsByIndex.get(idx) ?? {
                id: "",
                type: "function" as const,
                function: { name: "", arguments: "" },
              };
              if (d.id) existing.id = d.id;
              if (d.function?.name) existing.function.name = d.function.name;
              if (typeof d.function?.arguments === "string") {
                existing.function.arguments += d.function.arguments;
              }
              toolCallsByIndex.set(idx, existing);
            }
          }

          if (choice.finish_reason) finishReason = choice.finish_reason;
        } catch {
          /* skip malformed chunks */
        }
      }
    }

    // Si no hay tool calls (o finish_reason != tool_calls), terminamos.
    if (toolCallsByIndex.size === 0 || finishReason !== "tool_calls") {
      return;
    }

    // Ejecutar herramientas y continuar el loop.
    const calls = [...toolCallsByIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);

    working.push({ role: "assistant", content: assistantText, tool_calls: calls });
    for (const tc of calls) {
      yield { type: "tool_start", name: tc.function.name };
      const out = await executeTool(tc.function.name, tc.function.arguments, userId);
      yield { type: "tool_end", name: tc.function.name };
      working.push({ role: "tool", content: out, tool_call_id: tc.id, name: tc.function.name });
    }
  }
}

// ── Response parsing ─────────────────────────────────────────────────────────

function parseStructuredResponse(raw: string): AIResponse {
  const trimmed = raw.trim();

  // El prompt obliga al modelo a responder en markdown plano y terminar con
  // una línea "PREGUNTAS: a | b | c". Aquí separamos esa línea y la usamos
  // como sugerencias rápidas.
  let message = trimmed;
  let suggestions: string[] = [];
  const preguntasMatch = trimmed.match(/(?:^|\n)PREGUNTAS:\s*(.+?)\s*$/i);
  if (preguntasMatch) {
    message = trimmed.slice(0, preguntasMatch.index).trim();
    suggestions = preguntasMatch[1]
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 80)
      .slice(0, 3);
  }
  if (suggestions.length === 0) {
    suggestions = extractFallbackSuggestions(message);
  }

  return { message, suggestions, actionItems: [] };
}

function extractFallbackSuggestions(response: string): string[] {
  const suggestions: string[] = [];
  for (const line of response.split("\n")) {
    if (line.includes("?") && line.length < 80 && line.length > 10) {
      const cleaned = line
        .replace(/^[•\-*]\s*/, "")
        .replace(/^["']|["']$/g, "")
        .trim();
      if (cleaned.length > 10) suggestions.push(cleaned);
    }
  }
  if (suggestions.length >= 2) return suggestions.slice(0, 3);
  return ["¿Cómo puedo ahorrar más?", "¿Qué producto me conviene?", "Analiza mis gastos del mes"];
}

// ── No API key response ──────────────────────────────────────────────────────

function serviceUnavailableResponse(): AIResponse {
  return {
    message:
      "El asistente con IA no está configurado en el servidor (falta OPENAI_API_KEY, ANTHROPIC_API_KEY o GROQ_API_KEY). " +
      "Cuando el administrador configure una clave, podrás chatear con datos reales de tu cuenta.",
    suggestions: [],
  };
}

// ── Main chat function (non-streaming) ───────────────────────────────────────

export async function chat(
  userMessage: string,
  conversationHistory: Message[],
  financialContext: FinancialContext,
  userId?: string,
): Promise<AIResponse> {
  const chain = getProviderChain();

  if (chain.length === 0) {
    logger.warn("Asistente IA: ninguna clave de API configurada");
    return serviceUnavailableResponse();
  }

  const contextPrompt = buildContextPrompt(financialContext);
  const messages: Message[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextPrompt}` },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  // Intenta cada proveedor en orden; cae al siguiente si uno falla
  // (rate limit, timeout, error de red). Solo falla si TODOS fallan.
  let lastError: unknown;
  for (const provider of chain) {
    const apiKey = getApiKeyFor(provider)!;
    try {
      let response: string;
      switch (provider) {
        case "groq":
          // Si tenemos userId, habilitamos tool use (query_transactions, simulate_loan).
          response = userId
            ? await callGroqWithToolLoop(messages, apiKey, userId)
            : (await callGroq(messages, apiKey)).content;
          break;
        case "gemini":
          response = userId
            ? await callGeminiWithToolLoop(messages, apiKey, userId)
            : await callGemini(messages, apiKey);
          break;
        case "anthropic":
          response = await callAnthropic(messages, apiKey);
          break;
        case "openai":
          response = await callOpenAI(messages, apiKey);
          break;
      }

      logger.info({ provider }, "AI Service: Response generated");
      return parseStructuredResponse(response);
    } catch (error) {
      lastError = error;
      logger.warn(
        { err: error, provider },
        "Asistente IA: proveedor falló, intentando el siguiente",
      );
    }
  }

  logger.error({ err: lastError }, "Asistente IA: todos los proveedores fallaron");
  return {
    message: "No pudimos obtener respuesta del modelo de IA. Intenta de nuevo en unos segundos.",
    suggestions: ["Intenta de nuevo", "¿Cómo puedo ahorrar?", "Analiza mis gastos"],
  };
}

// ── Streaming chat function ──────────────────────────────────────────────────

function buildStreamFor(
  provider: AIProvider,
  apiKey: string,
  messages: Message[],
  userId?: string,
): AsyncGenerator<StreamEvent> {
  switch (provider) {
    case "groq":
      return userId ? streamGroqWithTools(messages, apiKey, userId) : streamGroq(messages, apiKey);
    case "gemini":
      return userId
        ? streamGeminiWithTools(messages, apiKey, userId)
        : streamGemini(messages, apiKey);
    case "anthropic":
      return streamAnthropic(messages, apiKey);
    case "openai":
      return streamOpenAI(messages, apiKey);
  }
}

// Generador con tolerancia a fallos: prueba cada proveedor en orden. Si uno
// falla ANTES de emitir contenido (rate limit, auth, red) cae al siguiente.
// Si falla a media respuesta (ya emitió texto) re-lanza, porque no se puede
// reiniciar el stream sin confundir la UI — la ruta ya maneja ese caso.
async function* streamWithFallback(
  chain: AIProvider[],
  messages: Message[],
  userId?: string,
): AsyncGenerator<StreamEvent> {
  let lastError: unknown;
  for (const provider of chain) {
    const apiKey = getApiKeyFor(provider)!;
    let yieldedAny = false;
    try {
      for await (const ev of buildStreamFor(provider, apiKey, messages, userId)) {
        yieldedAny = true;
        yield ev;
      }
      return; // completó sin error
    } catch (err) {
      lastError = err;
      logger.warn({ err, provider }, "Asistente IA (stream): proveedor falló");
      if (yieldedAny) throw err; // a media respuesta: no se puede reintentar limpio
      // si no emitió nada todavía, probamos el siguiente proveedor
    }
  }
  if (lastError) throw lastError;
}

export function getStreamGenerator(
  userMessage: string,
  conversationHistory: Message[],
  financialContext: FinancialContext,
  userId?: string,
): { stream: AsyncGenerator<StreamEvent>; provider: string } | null {
  const chain = getProviderChain();
  if (chain.length === 0) return null;

  const contextPrompt = buildContextPrompt(financialContext);
  const messages: Message[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextPrompt}` },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  return { stream: streamWithFallback(chain, messages, userId), provider: chain[0] };
}

export { parseStructuredResponse };

// Llamada plana sin el SYSTEM_PROMPT del asistente — útil para tareas
// internas (resumen de memoria, clasificadores, etc.) que necesitan un LLM
// pero NO la personalidad de CODA AI. Usa el mismo orden free-first de
// proveedores que el resto del servicio.
export async function simpleChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const chain = getProviderChain();
  if (chain.length === 0) throw new Error("No AI provider configured");

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let lastError: unknown;
  for (const provider of chain) {
    const apiKey = getApiKeyFor(provider)!;
    try {
      switch (provider) {
        case "groq":
          return (await callGroq(messages, apiKey)).content;
        case "gemini":
          return await callGemini(messages, apiKey);
        case "anthropic":
          return await callAnthropic(messages, apiKey);
        case "openai":
          return await callOpenAI(messages, apiKey);
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("All AI providers failed");
}

// ── Quick insights (template-based, no AI call) ──────────────────────────────

export function getQuickInsights(context: FinancialContext): string[] {
  const insights: string[] = [];

  if (context.savingsRate != null) {
    if (context.savingsRate >= 20) {
      insights.push(
        `Tu tasa de ahorro del ${context.savingsRate}% supera el 20% recomendado. ¡Excelente!`,
      );
    } else if (context.savingsRate >= 0) {
      insights.push(`Tu tasa de ahorro es ${context.savingsRate}%. La meta es llegar al 20%.`);
    }
  }

  if (context.topSpendingCategories?.length) {
    const top = context.topSpendingCategories[0];
    if (top) {
      insights.push(`Tu mayor gasto: ${top.name ?? "General"} con ${fmtClp(top.amount)}/mes.`);
    }
  }

  if (context.monthlyExpenses) {
    const potentialSavings = Math.round(context.monthlyExpenses * 0.1);
    insights.push(
      `Reducir 10% tus gastos = ${fmtClp(potentialSavings)}/mes extra (${fmtClp(potentialSavings * 12)}/año).`,
    );
  }

  if (context.netWorth && context.monthlyIncome && context.monthlyIncome > 0) {
    const months = context.netWorth / context.monthlyIncome;
    if (months >= 6) {
      insights.push(`Tu patrimonio cubre ${months.toFixed(0)} meses de ingreso. ¡Buen colchón!`);
    } else if (months >= 0) {
      insights.push(
        `Tu patrimonio cubre ${months.toFixed(1)} meses. Lo ideal es tener 6+ meses de reserva.`,
      );
    }
  }

  if (context.creditScore) {
    if (context.creditScore >= 700) {
      insights.push(
        `Score crediticio ${context.creditScore}/850 — acceso a las mejores tasas del mercado.`,
      );
    } else if (context.creditScore >= 500) {
      insights.push(
        `Score crediticio ${context.creditScore}/850 — puedes mejorarlo para acceder a mejores productos.`,
      );
    }
  }

  return insights.slice(0, 3);
}
