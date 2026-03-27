/**
 * Asistente financiero: OpenAI, Anthropic o Groq según variables de entorno.
 */
import { logger } from '../logger.js';

// Types
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
  recentTransactions?: { description: string; amount: number; category: string }[];
  financialGoals?: { name: string; progress: number }[];
}

export interface AIResponse {
  message: string;
  suggestions?: string[];
  actionItems?: { title: string; description: string; link?: string }[];
}

// Provider configuration
type AIProvider = 'openai' | 'anthropic' | 'groq';

const getProvider = (): AIProvider => {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GROQ_API_KEY) return 'groq';
  return 'openai';
};

// System prompt for the financial assistant
const SYSTEM_PROMPT = `You are CODA's AI Financial Assistant - a helpful, friendly, and knowledgeable advisor focused on personal finance. Your goal is to help users improve their financial health.

IMPORTANT: You must always respond in Spanish (Chile). All messages, suggestions, and action items must be in Spanish. Use "pesos" or "CLP" when referring to money unless the user explicitly uses dollars.

Key behaviors:
1. Be conversational and friendly, but professional
2. Provide specific, actionable advice based on the user's financial data
3. When you see opportunities to save money, be specific with amounts
4. Suggest relevant products or features when appropriate
5. Be encouraging about progress and realistic about challenges
6. Never share specific account numbers or sensitive data in responses
7. If you don't have enough information, ask clarifying questions

Response format:
- Keep responses concise (2-3 paragraphs max)
- Use bullet points for lists
- Include specific numbers when available
- End with a clear action item or question when appropriate
- Always write in Spanish`;

function buildContextPrompt(context: FinancialContext): string {
  const parts: string[] = ['Resumen financiero del usuario:'];
  
  if (context.totalBalance) {
    parts.push(`- Total balance across accounts: $${context.totalBalance.toLocaleString()}`);
  }
  if (context.monthlyIncome) {
    parts.push(`- Monthly income: $${context.monthlyIncome.toLocaleString()}`);
  }
  if (context.monthlyExpenses) {
    parts.push(`- Monthly expenses: $${context.monthlyExpenses.toLocaleString()}`);
  }
  if (context.savingsRate) {
    parts.push(`- Savings rate: ${context.savingsRate}%`);
  }
  if (context.netWorth) {
    parts.push(`- Net worth: $${context.netWorth.toLocaleString()}`);
  }
  if (context.creditScore) {
    parts.push(`- Credit score: ${context.creditScore}`);
  }
  
  if (context.topSpendingCategories && context.topSpendingCategories.length > 0) {
    parts.push('\nPrincipales categorías de gasto (aprox. último mes):');
    context.topSpendingCategories.slice(0, 5).forEach((cat) => {
      if (!cat) return;
      const amt = typeof cat.amount === 'number' && !Number.isNaN(cat.amount) ? cat.amount : 0;
      parts.push(`- ${cat.name ?? 'Categoría'}: $${amt.toLocaleString()}`);
    });
  }
  
  if (context.financialGoals && context.financialGoals.length > 0) {
    parts.push('\nMetas financieras:');
    context.financialGoals.forEach(goal => {
      parts.push(`- ${goal.name}: ${goal.progress}% completado`);
    });
  }

  return parts.join('\n');
}

// OpenAI implementation
async function callOpenAI(messages: Message[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// Anthropic Claude implementation
async function callAnthropic(messages: Message[], apiKey: string): Promise<string> {
  // Extract system message
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
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
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

// Groq (Llama) implementation
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
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

function serviceUnavailableResponse(): AIResponse {
  return {
    message:
      "El asistente con IA no está configurado en el servidor (falta OPENAI_API_KEY, ANTHROPIC_API_KEY o GROQ_API_KEY). " +
      "Cuando el administrador configure una clave, podrás chatear con datos reales de tu cuenta.",
    suggestions: [],
  };
}

// Main chat function
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
    // Build messages array
    const contextPrompt = buildContextPrompt(financialContext);
    const messages: Message[] = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextPrompt}` },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    // Call the appropriate provider
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

    return {
      message: response,
      suggestions: extractSuggestions(response),
    };
  } catch (error) {
    logger.error({ err: error, provider }, "Asistente IA: error del proveedor");
    return {
      message:
        "No pudimos obtener respuesta del modelo de IA en este momento. Intenta de nuevo más tarde o revisa la configuración del servidor.",
      suggestions: [],
    };
  }
}

// Extract follow-up suggestions from response
function extractSuggestions(response: string): string[] {
  // Simple extraction of questions or suggestions from the response
  const suggestions: string[] = [];
  
  // Look for lines that seem like suggestions
  const lines = response.split('\n');
  for (const line of lines) {
    if (line.includes('?') && line.length < 80) {
      const cleaned = line.replace(/^[•\-\*]\s*/, '').trim();
      if (cleaned.length > 10) {
        suggestions.push(cleaned);
      }
    }
  }

  // Default suggestions if none found (español)
  if (suggestions.length === 0) {
    return [
      'Cuéntame más',
      '¿Cómo puedo mejorar?',
      '¿Qué más debería saber?'
    ];
  }

  return suggestions.slice(0, 3);
}

// Get quick insights (for dashboard widgets) — en español
export function getQuickInsights(context: FinancialContext): string[] {
  const insights: string[] = [];
  
  if (context.savingsRate) {
    if (context.savingsRate >= 20) {
      insights.push(`Muy bien: tu tasa de ahorro del ${context.savingsRate}% supera el 20% recomendado.`);
    } else {
      insights.push(`Tu tasa de ahorro es ${context.savingsRate}%. Intenta llegar al 20% para una mejor salud financiera.`);
    }
  }

  if (context.topSpendingCategories && context.topSpendingCategories.length > 0) {
    const topCategory = context.topSpendingCategories[0];
    if (topCategory) {
      const catName =
        topCategory.name === 'Housing'
          ? 'Vivienda'
          : topCategory.name === 'Food & Dining'
            ? 'Comida y restaurantes'
            : topCategory.name === 'Transportation'
              ? 'Transporte'
              : topCategory.name ?? 'General';
      const amt = typeof topCategory.amount === 'number' && !Number.isNaN(topCategory.amount) ? topCategory.amount : 0;
      insights.push(`Tu mayor gasto es ${catName}: $${amt}/mes. ¿Podrías reducirlo?`);
    }
  }

  if (context.monthlyExpenses) {
    const potentialSavings = Math.round(context.monthlyExpenses * 0.1);
    insights.push(`Recortar un 10% en gastos te ahorraría $${potentialSavings}/mes o $${potentialSavings * 12}/año.`);
  }

  if (context.netWorth && context.monthlyIncome) {
    const months = context.netWorth / context.monthlyIncome;
    if (months >= 6) {
      insights.push(`Tu patrimonio equivale a ${months.toFixed(0)} meses de ingreso. ¡Buen fondo de emergencia!`);
    }
  }

  return insights.slice(0, 3);
}
