/**
 * Asistente financiero IA de CODA.
 * Soporta OpenAI, Anthropic y Groq con streaming SSE y respuestas estructuradas.
 */
import { logger } from '../logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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

type AIProvider = 'openai' | 'anthropic' | 'groq';

const getProvider = (): AIProvider => {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GROQ_API_KEY) return 'groq';
  return 'openai';
};

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el **Asistente Financiero de CODA**, una plataforma chilena de finanzas personales. Tu nombre es CODA AI. Eres experto en finanzas personales en Chile y conoces a fondo el sistema financiero local.

## Tu personalidad
- Cercano, empático y directo — como un amigo que sabe de plata
- Usas español chileno natural (puedes usar "cachai", "lucas", etc. si el usuario es informal)
- Siempre positivo pero honesto — no endulzas malas noticias
- Das consejos concretos con números, no generalidades

## Conocimiento financiero chileno
- **AFP**: conoces las 7 AFP (Capital, Cuprum, Habitat, Modelo, Planvital, ProVida, Uno), multifondos A-E, comisiones, APV régimen A y B
- **CAE / Créditos universitarios**: cómo funciona el CAE, beneficios de prepago
- **CMF**: regulador financiero, tasas máximas convencionales (tasa de usura ~36% anual para créditos de consumo)
- **UF**: unidad de fomento, su uso en créditos hipotecarios y arriendos
- **Impuestos**: Renta (tramos, devolución), boletas de honorarios (retención 13.75%), PPM
- **Productos**: cuentas corrientes, cuentas vista (Cuenta RUT, MACH, Tenpo), tarjetas de crédito, créditos de consumo, hipotecarios, fondos mutuos, depósitos a plazo, seguros
- **Instituciones**: bancos (BancoEstado, Banco de Chile, Santander, BCI, Scotiabank, Itaú, Falabella, etc.), cooperativas, cajas de compensación, fintechs
- **Subsidios**: subsidio habitacional DS1/DS49, bono marzo, IFE, AUF

## Conocimiento de CODA (la app)
Cuando sea relevante, recomienda funciones específicas de CODA:
- **/panel** → Dashboard con score crediticio dual, patrimonio neto, resumen financiero
- **/gastos** → Registro y categorización de gastos, análisis por categoría
- **/movimientos** → Historial de transacciones bancarias sincronizadas
- **/metas** → Metas de ahorro con seguimiento de progreso
- **/productos** → Marketplace con 50+ productos financieros comparados (cuentas, tarjetas, créditos, seguros)
- **/plan** → Plan financiero personalizado con recomendaciones
- **/dividir-cuenta** → Dividir gastos compartidos (arriendo, cenas, viajes)
- **/perfil** → Configuración, cartolas subidas, conexiones bancarias
- **/conexiones** → Sincronizar cuentas bancarias vía Open Finance

## Formato de respuesta
Responde en **texto plano con markdown**, sin JSON, sin bloques de código, sin envolturas.

- Usa **negritas** para datos clave (montos, porcentajes, plazos).
- Separa párrafos con doble salto de línea.
- Usa viñetas con \`-\` cuando corresponda (máximo 5).
- Mantén la respuesta a 2-4 párrafos cortos. Sé concreto y usa los números del usuario cuando estén disponibles.
- Montos en pesos chilenos con formato $XXX.XXX (punto como separador de miles).
- NO empieces la respuesta con "Claro", "Por supuesto" ni saludos vacíos — entra directo al punto.

Al final de tu respuesta, en una línea nueva separada por una línea en blanco, agrega exactamente este formato con 3 preguntas de seguimiento relevantes (cada una máximo 60 caracteres):

PREGUNTAS: pregunta uno | pregunta dos | pregunta tres

Esa línea es la última del mensaje. No agregues nada después.

## Reglas de seguridad
- Nunca compartas números de cuenta, RUT completo ni datos sensibles
- No inventes datos — si no tienes info, dilo claramente
- No des asesoría tributaria específica — recomienda consultar con un contador
- Si detectas una situación de deuda crítica, sé empático y sugiere buscar ayuda profesional`;

// ── Context builder (Spanish) ────────────────────────────────────────────────

function fmtClp(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

export function buildContextPrompt(context: FinancialContext): string {
  const parts: string[] = ['## Datos financieros del usuario (últimos ~30 días)'];

  if (context.accountSummary) {
    const s = context.accountSummary;
    parts.push('\n### Cuentas');
    if (s.checking) parts.push(`- Cuenta corriente/vista: ${fmtClp(s.checking)}`);
    if (s.savings) parts.push(`- Ahorro: ${fmtClp(s.savings)}`);
    if (s.credit) parts.push(`- Deuda tarjetas crédito: ${fmtClp(s.credit)}`);
    if (s.investment) parts.push(`- Inversiones: ${fmtClp(s.investment)}`);
  }

  if (context.totalBalance) {
    parts.push(`- Balance total: ${fmtClp(context.totalBalance)}`);
  }

  parts.push('\n### Flujo mensual');
  if (context.monthlyIncome) {
    parts.push(`- Ingresos mensuales: ${fmtClp(context.monthlyIncome)}`);
  }
  if (context.monthlyExpenses) {
    parts.push(`- Gastos mensuales: ${fmtClp(context.monthlyExpenses)}`);
  }
  if (context.savingsRate != null) {
    parts.push(`- Tasa de ahorro: ${context.savingsRate}%`);
  }
  if (context.netWorth) {
    parts.push(`- Patrimonio neto: ${fmtClp(context.netWorth)}`);
  }
  if (context.creditScore) {
    parts.push(`- Score crediticio CODA: ${context.creditScore}/850`);
  }

  if (context.topSpendingCategories && context.topSpendingCategories.length > 0) {
    parts.push('\n### Principales categorías de gasto');
    for (const cat of context.topSpendingCategories.slice(0, 5)) {
      if (!cat) continue;
      parts.push(`- ${cat.name ?? 'Otro'}: ${fmtClp(cat.amount)}/mes`);
    }
  }

  if (context.debts && context.debts.length > 0) {
    parts.push('\n### Deudas');
    for (const d of context.debts) {
      const rate = d.rate ? ` (tasa ${d.rate}%)` : '';
      parts.push(`- ${d.type}: ${fmtClp(d.balance)}${rate}`);
    }
  }

  if (context.recentTransactions && context.recentTransactions.length > 0) {
    parts.push('\n### Últimas transacciones');
    for (const t of context.recentTransactions.slice(0, 8)) {
      const dateStr = t.date ? ` (${t.date})` : '';
      parts.push(`- ${t.description}: ${fmtClp(t.amount)} [${t.category}]${dateStr}`);
    }
  }

  if (context.financialGoals && context.financialGoals.length > 0) {
    parts.push('\n### Metas financieras');
    for (const goal of context.financialGoals) {
      parts.push(`- ${goal.name}: ${goal.progress}% completado`);
    }
  }

  return parts.join('\n');
}

// ── Provider implementations ─────────────────────────────────────────────────

async function callOpenAI(messages: Message[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(messages: Message[], apiKey: string): Promise<string> {
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const chatMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1500,
      system: systemMessage,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

async function callGroq(messages: Message[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// ── Streaming implementations ────────────────────────────────────────────────

export async function* streamOpenAI(messages: Message[], apiKey: string): AsyncGenerator<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.6,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch { /* skip malformed chunks */ }
    }
  }
}

export async function* streamAnthropic(messages: Message[], apiKey: string): AsyncGenerator<string> {
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const chatMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1500,
      stream: true,
      system: systemMessage,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      } catch { /* skip */ }
    }
  }
}

export async function* streamGroq(messages: Message[], apiKey: string): AsyncGenerator<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 1500,
      temperature: 0.6,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch { /* skip */ }
    }
  }
}

// ── Response parsing ─────────────────────────────────────────────────────────

function parseStructuredResponse(raw: string): AIResponse {
  const trimmed = raw.trim();

  // Backward compat: if the model still returned JSON (or a ```json fence), parse it.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed.message === 'string') {
        return {
          message: parsed.message,
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions.filter((s: unknown) => typeof s === 'string' && s.length > 0).slice(0, 3)
            : extractFallbackSuggestions(parsed.message),
          actionItems: Array.isArray(parsed.actionItems)
            ? parsed.actionItems
                .filter((a: unknown) => a && typeof a === 'object' && 'title' in (a as object))
                .slice(0, 3)
                .map((a: Record<string, unknown>) => ({
                  title: String(a.title || ''),
                  description: String(a.description || ''),
                  link: typeof a.link === 'string' ? a.link : undefined,
                  icon: typeof a.icon === 'string' ? a.icon : undefined,
                }))
            : [],
        };
      }
    } catch {
      // fall through to plain-text parsing
    }
  }

  // Plain markdown path: split off the trailing "PREGUNTAS: a | b | c" line if present.
  let message = trimmed;
  let suggestions: string[] = [];
  const preguntasMatch = trimmed.match(/(?:^|\n)PREGUNTAS:\s*(.+?)\s*$/i);
  if (preguntasMatch) {
    message = trimmed.slice(0, preguntasMatch.index).trim();
    suggestions = preguntasMatch[1]
      .split('|')
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
  for (const line of response.split('\n')) {
    if (line.includes('?') && line.length < 80 && line.length > 10) {
      const cleaned = line.replace(/^[•\-*]\s*/, '').replace(/^["']|["']$/g, '').trim();
      if (cleaned.length > 10) suggestions.push(cleaned);
    }
  }
  if (suggestions.length >= 2) return suggestions.slice(0, 3);
  return [
    '¿Cómo puedo ahorrar más?',
    '¿Qué producto me conviene?',
    'Analiza mis gastos del mes',
  ];
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
  financialContext: FinancialContext
): Promise<AIResponse> {
  const provider = getProvider();
  const apiKey = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    groq: process.env.GROQ_API_KEY,
  }[provider];

  if (!apiKey) {
    logger.warn("Asistente IA: ninguna clave de API configurada");
    return serviceUnavailableResponse();
  }

  try {
    const contextPrompt = buildContextPrompt(financialContext);
    const messages: Message[] = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextPrompt}` },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    let response: string;
    switch (provider) {
      case 'openai':
        response = await callOpenAI(messages, apiKey);
        break;
      case 'anthropic':
        response = await callAnthropic(messages, apiKey);
        break;
      case 'groq':
        response = await callGroq(messages, apiKey);
        break;
      default:
        response = await callOpenAI(messages, apiKey);
    }

    logger.info({ provider }, 'AI Service: Response generated');
    return parseStructuredResponse(response);
  } catch (error) {
    logger.error({ err: error, provider }, "Asistente IA: error del proveedor");
    return {
      message:
        "No pudimos obtener respuesta del modelo de IA. Intenta de nuevo en unos segundos.",
      suggestions: ['Intenta de nuevo', '¿Cómo puedo ahorrar?', 'Analiza mis gastos'],
    };
  }
}

// ── Streaming chat function ──────────────────────────────────────────────────

export function getStreamGenerator(
  userMessage: string,
  conversationHistory: Message[],
  financialContext: FinancialContext
): { stream: AsyncGenerator<string>; provider: string } | null {
  const provider = getProvider();
  const apiKey = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    groq: process.env.GROQ_API_KEY,
  }[provider];

  if (!apiKey) return null;

  const contextPrompt = buildContextPrompt(financialContext);
  const messages: Message[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextPrompt}` },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let stream: AsyncGenerator<string>;
  switch (provider) {
    case 'openai':
      stream = streamOpenAI(messages, apiKey);
      break;
    case 'anthropic':
      stream = streamAnthropic(messages, apiKey);
      break;
    case 'groq':
      stream = streamGroq(messages, apiKey);
      break;
    default:
      stream = streamOpenAI(messages, apiKey);
  }

  return { stream, provider };
}

export { parseStructuredResponse };

// ── Quick insights (template-based, no AI call) ──────────────────────────────

export function getQuickInsights(context: FinancialContext): string[] {
  const insights: string[] = [];

  if (context.savingsRate != null) {
    if (context.savingsRate >= 20) {
      insights.push(`Tu tasa de ahorro del ${context.savingsRate}% supera el 20% recomendado. ¡Excelente!`);
    } else if (context.savingsRate >= 0) {
      insights.push(`Tu tasa de ahorro es ${context.savingsRate}%. La meta es llegar al 20%.`);
    }
  }

  if (context.topSpendingCategories?.length) {
    const top = context.topSpendingCategories[0];
    if (top) {
      insights.push(`Tu mayor gasto: ${top.name ?? 'General'} con ${fmtClp(top.amount)}/mes.`);
    }
  }

  if (context.monthlyExpenses) {
    const potentialSavings = Math.round(context.monthlyExpenses * 0.1);
    insights.push(`Reducir 10% tus gastos = ${fmtClp(potentialSavings)}/mes extra (${fmtClp(potentialSavings * 12)}/año).`);
  }

  if (context.netWorth && context.monthlyIncome && context.monthlyIncome > 0) {
    const months = context.netWorth / context.monthlyIncome;
    if (months >= 6) {
      insights.push(`Tu patrimonio cubre ${months.toFixed(0)} meses de ingreso. ¡Buen colchón!`);
    } else if (months >= 0) {
      insights.push(`Tu patrimonio cubre ${months.toFixed(1)} meses. Lo ideal es tener 6+ meses de reserva.`);
    }
  }

  if (context.creditScore) {
    if (context.creditScore >= 700) {
      insights.push(`Score crediticio ${context.creditScore}/850 — acceso a las mejores tasas del mercado.`);
    } else if (context.creditScore >= 500) {
      insights.push(`Score crediticio ${context.creditScore}/850 — puedes mejorarlo para acceder a mejores productos.`);
    }
  }

  return insights.slice(0, 3);
}
