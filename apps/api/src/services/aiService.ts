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

Key behaviors:
1. Be conversational and friendly, but professional
2. Provide specific, actionable advice based on the user's financial data
3. When you see opportunities to save money, be specific (e.g., "Reducing your $340/month dining expenses by 20% would save you $816/year")
4. Suggest relevant products or features when appropriate
5. Be encouraging about progress and realistic about challenges
6. Never share specific account numbers or sensitive data in responses
7. If you don't have enough information, ask clarifying questions

Response format:
- Keep responses concise (2-3 paragraphs max)
- Use bullet points for lists
- Include specific numbers when available
- End with a clear action item or question when appropriate`;

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
      model: 'llama3-70b-8192',
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
  
  // Analyze spending patterns
  if (message.includes('save') || message.includes('saving') || message.includes('budget')) {
    const coffeeEstimate = 5 * 20; // $5/day * 20 work days
    const potentialSavings = Math.round(coffeeEstimate * 12);
    
    return {
      message: `Great question about saving! Looking at your spending patterns, here are some opportunities I've identified:

**Quick wins:**
• If you're buying coffee daily (~$5/day), making it at home could save you **$${potentialSavings}/year**
• Your dining expenses of $${context.topSpendingCategories?.[1]?.amount || 680}/month are above average - reducing by 15% saves $${Math.round((context.topSpendingCategories?.[1]?.amount || 680) * 0.15 * 12)}/year

Your current savings rate of **${context.savingsRate || 28}%** is actually great! The recommended rate is 20%, so you're ahead of the curve.

Would you like specific tips for any particular spending category?`,
      suggestions: [
        'Show me dining expense details',
        'How can I automate savings?',
        'Compare my spending to others'
      ],
      actionItems: [
        { title: 'Set up automatic transfers', description: 'Move 10% of income to savings automatically', link: '/goals' },
        { title: 'Review subscriptions', description: 'Check for unused monthly subscriptions', link: '/expenses' },
      ]
    };
  }
  
  // Credit card offers
  if (message.includes('credit') || message.includes('card') || message.includes('offer')) {
    return {
      message: `Based on your credit score of **${context.creditScore || 720}** and spending habits, here are some opportunities:

**Recommended Credit Cards:**
• **Cash Back Card**: With your $${context.monthlyExpenses?.toLocaleString() || '3,845'}/month spending, a 2% cash back card could earn you **$${Math.round((context.monthlyExpenses || 3845) * 0.02 * 12)}/year**
• **Travel Rewards**: If you travel, your spending could earn 50,000+ points annually

Your current credit utilization looks healthy. Would you like me to show you specific card offers that match your profile?`,
      suggestions: [
        'Show me cash back cards',
        'Compare travel rewards cards',
        'How do I improve my credit score?'
      ],
      actionItems: [
        { title: 'Compare credit cards', description: 'See personalized card recommendations', link: '/products?category=credit-cards' },
      ]
    };
  }
  
  // Investment advice
  if (message.includes('invest') || message.includes('retirement') || message.includes('401k')) {
    const monthlyToInvest = Math.round((context.monthlyIncome || 7500) * 0.15);
    
    return {
      message: `Smart thinking about investments! Here's what I see:

**Your Investment Potential:**
• With your income of $${(context.monthlyIncome || 7500).toLocaleString()}/month, you could invest **$${monthlyToInvest}/month** (15%)
• At 7% average returns, that's approximately **$${Math.round(monthlyToInvest * 12 * 1.07)}** after your first year

**Recommendations:**
1. Max out any employer 401(k) match first - that's free money!
2. Consider a Roth IRA if you haven't already
3. For remaining funds, a diversified index fund is a solid choice

Want me to help you set up an investment goal to track your progress?`,
      suggestions: [
        'Set up investment goal',
        'Explain Roth vs Traditional IRA',
        'Show me index fund options'
      ],
      actionItems: [
        { title: 'Create investment goal', description: 'Track your investment progress', link: '/goals' },
      ]
    };
  }

  // Goals and progress
  if (message.includes('goal') || message.includes('progress') || message.includes('track')) {
    return {
      message: `Let me check on your financial goals! 📊

**Current Progress:**
${context.financialGoals?.map(g => `• **${g.name}**: ${g.progress}% complete`).join('\n') || '• No goals set yet - would you like to create one?'}

**Insights:**
At your current savings rate of ${context.savingsRate || 28}%, you're making excellent progress. Your net worth of **$${(context.netWorth || 142350).toLocaleString()}** puts you in a strong position.

Keep it up! Would you like to add a new goal or adjust your existing ones?`,
      suggestions: [
        'Add a new savings goal',
        'Adjust my emergency fund target',
        'Set a vacation fund goal'
      ],
      actionItems: [
        { title: 'Manage goals', description: 'View and edit your financial goals', link: '/goals' },
      ]
    };
  }

  // Default response
  return {
    message: `Hi! I'm your CODA Financial Assistant. I can help you with:

**What I can do:**
• 💰 Analyze your spending and find savings opportunities
• 💳 Recommend credit cards and financial products
• 📈 Help you reach your financial goals
• 📊 Explain your credit score and how to improve it

**Your Quick Stats:**
• Net Worth: $${(context.netWorth || 142350).toLocaleString()}
• Monthly Savings: $${((context.monthlyIncome || 7500) - (context.monthlyExpenses || 3845)).toLocaleString()}
• Savings Rate: ${context.savingsRate || 28}%

What would you like to know about your finances?`,
    suggestions: [
      'How can I save more money?',
      'Show me credit card offers',
      'How am I doing compared to my goals?',
      'What should I invest in?'
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

  // Default suggestions if none found
  if (suggestions.length === 0) {
    return [
      'Tell me more',
      'How can I improve?',
      'What else should I know?'
    ];
  }

  return suggestions.slice(0, 3);
}

// Get quick insights (for dashboard widgets)
export function getQuickInsights(context: FinancialContext): string[] {
  const insights: string[] = [];
  
  // Savings rate insight
  if (context.savingsRate) {
    if (context.savingsRate >= 20) {
      insights.push(`Great job! Your ${context.savingsRate}% savings rate beats the recommended 20%.`);
    } else {
      insights.push(`Your savings rate is ${context.savingsRate}%. Try to reach 20% for better financial health.`);
    }
  }

  // Spending insights
  if (context.topSpendingCategories && context.topSpendingCategories.length > 0) {
    const topCategory = context.topSpendingCategories[0];
    if (topCategory.name.toLowerCase() !== 'housing') {
      insights.push(`Your top expense is ${topCategory.name} at $${topCategory.amount}/month. Could you reduce this?`);
    }
  }

  // Coffee/dining insight (common savings opportunity)
  if (context.monthlyExpenses) {
    const potentialSavings = Math.round(context.monthlyExpenses * 0.1);
    insights.push(`Cutting 10% from expenses would save you $${potentialSavings}/month or $${potentialSavings * 12}/year.`);
  }

  // Net worth insight
  if (context.netWorth && context.monthlyIncome) {
    const months = context.netWorth / context.monthlyIncome;
    if (months >= 6) {
      insights.push(`Your net worth covers ${months.toFixed(0)} months of income. Great emergency fund!`);
    }
  }

  return insights.slice(0, 3);
}
