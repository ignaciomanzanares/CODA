/**
 * Expense classification utility
 * Supports both rule-based classification and AI-powered classification using Groq
 */

import { logger } from '../logger.js';

interface ClassificationResult {
  category: string;
  subcategory?: string;
  confidence: number;
}

const MERCHANT_PATTERNS = {
  // Grocery stores
  groceries: [
    /whole foods/i, /trader joe/i, /safeway/i, /kroger/i, /walmart/i, /target/i,
    /costco/i, /grocery/i, /market/i, /food/i, /supermarket/i
  ],
  
  // Restaurants and dining
  dining: [
    /restaurant/i, /cafe/i, /coffee/i, /starbucks/i, /mcdonald/i, /burger/i,
    /pizza/i, /diner/i, /bistro/i, /grill/i, /bar/i, /pub/i
  ],
  
  // Gas stations and fuel
  transportation: [
    /shell/i, /exxon/i, /chevron/i, /bp/i, /mobil/i, /gas/i, /fuel/i,
    /station/i, /uber/i, /lyft/i, /taxi/i, /metro/i, /transit/i
  ],
  
  // Entertainment
  entertainment: [
    /cinema/i, /movie/i, /theater/i, /netflix/i, /spotify/i, /gym/i,
    /fitness/i, /concert/i, /game/i, /entertainment/i, /park/i
  ],
  
  // Healthcare
  healthcare: [
    /hospital/i, /clinic/i, /doctor/i, /pharmacy/i, /cvs/i, /walgreens/i,
    /medical/i, /dental/i, /health/i
  ],
  
  // Utilities
  utilities: [
    /electric/i, /power/i, /gas company/i, /water/i, /internet/i, /phone/i,
    /cable/i, /utility/i
  ]
};

const DESCRIPTION_PATTERNS = {
  housing: [
    /rent/i, /mortgage/i, /property/i, /apartment/i, /house/i, /home/i,
    /insurance.*home/i, /property.*tax/i
  ],
  
  groceries: [
    /grocery/i, /food/i, /supermarket/i, /market/i, /produce/i
  ],
  
  dining: [
    /dinner/i, /lunch/i, /breakfast/i, /meal/i, /restaurant/i, /takeout/i,
    /delivery/i, /coffee/i
  ],
  
  transportation: [
    /gas/i, /fuel/i, /car/i, /auto/i, /parking/i, /toll/i, /uber/i, /lyft/i,
    /taxi/i, /bus/i, /train/i, /metro/i
  ],
  
  entertainment: [
    /movie/i, /show/i, /concert/i, /game/i, /sport/i, /gym/i, /fitness/i,
    /hobby/i, /book/i, /music/i
  ],
  
  healthcare: [
    /doctor/i, /hospital/i, /medical/i, /pharmacy/i, /prescription/i,
    /dental/i, /vision/i, /health/i
  ],
  
  shopping: [
    /clothes/i, /clothing/i, /shoes/i, /electronics/i, /amazon/i, /store/i,
    /shop/i, /purchase/i, /buy/i
  ],
  
  utilities: [
    /electric/i, /power/i, /water/i, /gas.*bill/i, /internet/i, /phone/i,
    /cable/i, /utility/i
  ],
  
  education: [
    /school/i, /university/i, /college/i, /tuition/i, /book/i, /course/i,
    /class/i, /education/i
  ]
};

export function classifyExpense(
  description: string,
  merchantName?: string,
  amount?: number
): ClassificationResult {
  const text = `${description} ${merchantName || ''}`.toLowerCase();
  
  // Check merchant patterns first (higher confidence)
  for (const [category, patterns] of Object.entries(MERCHANT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return {
          category: capitalizeCategory(category),
          confidence: 0.9,
          subcategory: getSubcategory(category, text, amount)
        };
      }
    }
  }
  
  // Check description patterns (medium confidence)
  for (const [category, patterns] of Object.entries(DESCRIPTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return {
          category: capitalizeCategory(category),
          confidence: 0.75,
          subcategory: getSubcategory(category, text, amount)
        };
      }
    }
  }
  
  // Default categorization based on amount (low confidence)
  if (amount) {
    if (amount > 1000) {
      return { category: "Housing", confidence: 0.3 };
    } else if (amount < 10) {
      return { category: "Other", confidence: 0.2 };
    }
  }
  
  return { category: "Other", confidence: 0.1 };
}

function capitalizeCategory(category: string): string {
  const categoryMap: { [key: string]: string } = {
    groceries: "Groceries",
    dining: "Dining",
    transportation: "Transportation",
    entertainment: "Entertainment",
    healthcare: "Healthcare",
    utilities: "Utilities",
    housing: "Housing",
    shopping: "Shopping",
    education: "Education"
  };
  
  return categoryMap[category] || "Other";
}

function getSubcategory(category: string, text: string, amount?: number): string | undefined {
  switch (category) {
    case "groceries":
      if (/organic/i.test(text)) return "Organic";
      if (/bulk/i.test(text)) return "Bulk Shopping";
      return "Food & Beverages";
      
    case "dining":
      if (/coffee/i.test(text)) return "Coffee & Cafe";
      if (/fast.*food/i.test(text) || /mcdonald/i.test(text)) return "Fast Food";
      if (amount && amount > 50) return "Fine Dining";
      return "Casual Dining";
      
    case "transportation":
      if (/gas|fuel/i.test(text)) return "Fuel";
      if (/uber|lyft|taxi/i.test(text)) return "Rideshare";
      if (/parking/i.test(text)) return "Parking";
      return "Public Transit";
      
    case "entertainment":
      if (/gym|fitness/i.test(text)) return "Fitness";
      if (/movie|cinema/i.test(text)) return "Movies";
      if (/music|spotify/i.test(text)) return "Music";
      return "Recreation";
      
    case "healthcare":
      if (/pharmacy/i.test(text)) return "Pharmacy";
      if (/dental/i.test(text)) return "Dental";
      return "Medical";
      
    case "utilities":
      if (/electric|power/i.test(text)) return "Electricity";
      if (/water/i.test(text)) return "Water";
      if (/internet|cable/i.test(text)) return "Internet & Cable";
      return "Other Utilities";
      
    default:
      return undefined;
  }
}

export function getExpenseInsights(expenses: Array<{ amount: string | number; category: string; date: string | Date }>): {
  topCategories: { category: string; amount: number; percentage: number }[];
  monthlyTrend: { month: string; amount: number }[];
  avgPerCategory: { category: string; avg: number }[];
} {
  // Calculate top spending categories
  const categoryTotals: { [key: string]: number } = {};
  const totalSpent = expenses.reduce((sum, expense) => {
    const amount = parseFloat(String(expense.amount));
    const category = expense.category;
    categoryTotals[category] = (categoryTotals[category] || 0) + amount;
    return sum + amount;
  }, 0);
  
  const topCategories = Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: (amount / totalSpent) * 100
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  
  // Calculate monthly trend (last 6 months)
  const monthlyTotals: { [key: string]: number } = {};
  expenses.forEach(expense => {
    const date = new Date(expense.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + parseFloat(String(expense.amount));
  });
  
  const monthlyTrend = Object.entries(monthlyTotals)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);
  
  // Calculate average per category
  const categoryCounts: { [key: string]: number } = {};
  expenses.forEach(expense => {
    categoryCounts[expense.category] = (categoryCounts[expense.category] || 0) + 1;
  });
  
  const avgPerCategory = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      avg: total / categoryCounts[category]
    }))
    .sort((a, b) => b.avg - a.avg);
  
  return {
    topCategories,
    monthlyTrend,
    avgPerCategory
  };
}

/**
 * AI-powered expense classification using Groq
 */
export async function classifyExpenseWithAI(
  description: string,
  merchantName?: string,
  amount?: number
): Promise<ClassificationResult> {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    logger.warn('GROQ_API_KEY not configured, falling back to rule-based classification');
    return classifyExpense(description, merchantName, amount);
  }

  try {
    const prompt = `You are an expense categorization AI. Categorize the following expense into one of these categories: Groceries, Dining, Transportation, Housing, Healthcare, Entertainment, Shopping, Utilities, Education, Travel, Other.

Expense details:
- Description: ${description}
- Merchant: ${merchantName || 'Unknown'}
- Amount: $${amount || 'Unknown'}

Respond with ONLY a JSON object in this exact format:
{
  "category": "CategoryName",
  "subcategory": "SubcategoryName",
  "confidence": 0.95
}

The confidence should be between 0.0 and 1.0. Choose the most appropriate category and subcategory based on the expense details.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.1, // Low temperature for consistent categorization
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content?.trim();

    if (!aiResponse) {
      throw new Error('Empty response from Groq API');
    }

    // Parse the JSON response
    const parsed = JSON.parse(aiResponse);
    
    // Validate the response structure
    if (!parsed.category || typeof parsed.confidence !== 'number') {
      throw new Error('Invalid response format from AI');
    }

    logger.info({ 
      description, 
      merchantName, 
      amount, 
      aiCategory: parsed.category, 
      confidence: parsed.confidence 
    }, 'AI expense classification successful');

    return {
      category: parsed.category,
      subcategory: parsed.subcategory || undefined,
      confidence: Math.max(0.7, parsed.confidence) // Ensure minimum confidence for AI classifications
    };

  } catch (error) {
    logger.error({ err: error, description, merchantName, amount }, 'AI expense classification failed, falling back to rule-based');
    
    // Fallback to rule-based classification
    const fallbackResult = classifyExpense(description, merchantName, amount);
    return {
      ...fallbackResult,
      confidence: Math.min(fallbackResult.confidence, 0.6) // Lower confidence for fallback
    };
  }
}