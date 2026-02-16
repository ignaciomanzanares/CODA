/**
 * AI Service for Financial Assistant
 * Supports multiple AI providers: OpenAI, Anthropic Claude, Groq (Llama)
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
  return 'openai'; // Default, will use demo mode if no key
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

// Build context prompt from user's financial data
function buildContextPrompt(context: FinancialContext): string {
  const parts: string[] = ['Current financial snapshot:'];
  
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
    parts.push('\nTop spending categories this month:');
    context.topSpendingCategories.slice(0, 5).forEach(cat => {
      parts.push(`- ${cat.name}: $${cat.amount.toLocaleString()}`);
    });
  }
  
  if (context.financialGoals && context.financialGoals.length > 0) {
    parts.push('\nFinancial goals:');
    context.financialGoals.forEach(goal => {
      parts.push(`- ${goal.name}: ${goal.progress}% complete`);
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

// Demo response generator (when no API key is configured)
function generateDemoResponse(userMessage: string, context: FinancialContext): AIResponse {
  const message = userMessage.toLowerCase();
  
  // Analyze spending patterns (ahorro / ahorrar / presupuesto)
  if (message.includes('save') || message.includes('saving') || message.includes('budget') || message.includes('ahorro') || message.includes('ahorrar') || message.includes('presupuesto')) {
    const coffeeEstimate = 5 * 20; // $5/day * 20 work days
    const potentialSavings = Math.round(coffeeEstimate * 12);
    
    return {
      message: `Buena pregunta sobre el ahorro. Según tu perfil, estas son algunas oportunidades:

**Ganancias rápidas:**
• Si compras café a diario (~$5/día), prepararlo en casa podría ahorrarte **$${potentialSavings}/año**
• Tus gastos en comida de $${context.topSpendingCategories?.[1]?.amount || 680}/mes están por encima del promedio; reducir 15% te ahorraría $${Math.round((context.topSpendingCategories?.[1]?.amount || 680) * 0.15 * 12)}/año

Tu tasa de ahorro actual de **${context.savingsRate || 28}%** es muy buena. Lo recomendado es 20%, así que vas bien.

¿Quieres consejos para alguna categoría en particular?`,
      suggestions: [
        'Ver detalle de gastos en comida',
        '¿Cómo automatizar el ahorro?',
        'Comparar mis gastos con otros'
      ],
      actionItems: [
        { title: 'Configurar transferencias automáticas', description: 'Traslada el 10% de tu ingreso al ahorro automáticamente', link: '/goals' },
        { title: 'Revisar suscripciones', description: 'Revisa suscripciones mensuales que no uses', link: '/expenses' },
      ]
    };
  }
  
  // Credit card offers (crédito / tarjeta / ofertas)
  if (message.includes('credit') || message.includes('card') || message.includes('offer') || message.includes('crédito') || message.includes('tarjeta') || message.includes('ofertas')) {
    return {
      message: `Según tu puntaje de crédito **${context.creditScore || 720}** y tus gastos, estas son algunas opciones:

**Tarjetas recomendadas:**
• **Cashback**: Con $${context.monthlyExpenses?.toLocaleString() || '3,845'}/mes en gastos, una tarjeta con 2% de cashback podría darte **$${Math.round((context.monthlyExpenses || 3845) * 0.02 * 12)}/año**
• **Viajes**: Si viajas, tus gastos podrían sumar más de 50.000 puntos al año

Tu uso de crédito se ve saludable. ¿Quieres que te muestre ofertas de tarjetas para tu perfil?`,
      suggestions: [
        'Ver tarjetas con cashback',
        'Comparar tarjetas de viajes',
        '¿Cómo mejorar mi puntaje de crédito?'
      ],
      actionItems: [
        { title: 'Comparar tarjetas', description: 'Ver recomendaciones personalizadas', link: '/products?category=credit-cards' },
      ]
    };
  }
  
  // Investment advice (invertir / jubilación)
  if (message.includes('invest') || message.includes('retirement') || message.includes('401k') || message.includes('invertir') || message.includes('jubilación') || message.includes('afp')) {
    const monthlyToInvest = Math.round((context.monthlyIncome || 7500) * 0.15);
    
    return {
      message: `Buena idea pensar en inversiones. Esto es lo que veo:

**Tu potencial de inversión:**
• Con un ingreso de $${(context.monthlyIncome || 7500).toLocaleString()}/mes, podrías invertir **$${monthlyToInvest}/mes** (15%)
• Con un 7% de retorno promedio, sería aproximadamente **$${Math.round(monthlyToInvest * 12 * 1.07)}** al primer año

**Recomendaciones:**
1. Aprovecha primero el aporte patronal a tu AFP o fondo de pensiones
2. Considera un ahorro voluntario en tu AFP si aún no lo tienes
3. Para el resto, un fondo mutuo diversificado es una opción sólida

¿Quieres que te ayude a crear una meta de inversión para seguir tu avance?`,
      suggestions: [
        'Crear meta de inversión',
        'Explicar AFP y ahorro voluntario',
        'Ver opciones de fondos mutuos'
      ],
      actionItems: [
        { title: 'Crear meta de inversión', description: 'Seguir tu avance de inversión', link: '/goals' },
      ]
    };
  }

  // Goals and progress (metas / progreso)
  if (message.includes('goal') || message.includes('progress') || message.includes('track') || message.includes('meta') || message.includes('progreso')) {
    return {
      message: `Aquí está el avance de tus metas financieras 📊

**Progreso actual:**
${context.financialGoals?.map(g => `• **${g.name}**: ${g.progress}% completado`).join('\n') || '• Aún no tienes metas; ¿quieres crear una?'}

**Resumen:**
Con una tasa de ahorro del ${context.savingsRate || 28}% vas muy bien. Tu patrimonio de **$${(context.netWorth || 142350).toLocaleString()}** te deja en buena posición.

¿Quieres agregar una meta nueva o ajustar las que tienes?`,
      suggestions: [
        'Agregar una meta de ahorro',
        'Ajustar mi fondo de emergencia',
        'Crear meta para vacaciones'
      ],
      actionItems: [
        { title: 'Gestionar metas', description: 'Ver y editar tus metas financieras', link: '/goals' },
      ]
    };
  }

  // Default response
  const monthlySavings = ((context.monthlyIncome || 7500) - (context.monthlyExpenses || 3845)).toLocaleString();
  return {
    message: `Hola, soy tu Asistente Financiero CODA. Puedo ayudarte con:

**Qué puedo hacer:**
• 💰 Analizar tus gastos y encontrar oportunidades de ahorro
• 💳 Recomendar tarjetas y productos financieros
• 📈 Ayudarte a cumplir tus metas financieras
• 📊 Explicar tu puntaje de crédito y cómo mejorarlo

**Tus números rápidos:**
• Patrimonio: $${(context.netWorth || 142350).toLocaleString()}
• Ahorro mensual: $${monthlySavings}
• Tasa de ahorro: ${context.savingsRate || 28}%

¿Qué te gustaría saber sobre tus finanzas?`,
    suggestions: [
      '¿Cómo puedo ahorrar más?',
      'Ver ofertas de tarjetas de crédito',
      '¿Cómo voy con mis metas?',
      '¿En qué debería invertir?'
    ]
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

  // If no API key, use demo mode
  if (!apiKey) {
    logger.info('AI Service: Using demo mode (no API key configured)');
    return generateDemoResponse(userMessage, financialContext);
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
    logger.error({ err: error, provider }, 'AI Service: Error calling provider');
    
    // Fallback to demo mode on error
    return generateDemoResponse(userMessage, financialContext);
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
    const catName = topCategory.name === 'Housing' ? 'Vivienda' : topCategory.name === 'Food & Dining' ? 'Comida y restaurantes' : topCategory.name === 'Transportation' ? 'Transporte' : topCategory.name;
    insights.push(`Tu mayor gasto es ${catName}: $${topCategory.amount}/mes. ¿Podrías reducirlo?`);
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
