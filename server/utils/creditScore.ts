import { BankConnection } from "@shared/schema";

// Credit score factors and weights
const CREDIT_FACTORS = {
  PAYMENT_HISTORY: 0.35,
  CREDIT_UTILIZATION: 0.30,
  CREDIT_AGE: 0.15,
  ACCOUNT_MIX: 0.10,
  INQUIRIES: 0.10
};

// Rating thresholds for each factor
const FACTOR_RATINGS = {
  EXCELLENT: 0.9,
  GOOD: 0.8,
  AVERAGE: 0.65,
  POOR: 0.5
};

interface CreditScoreResult {
  score: number;
  maxScore: number;
  paymentHistory: string;
  utilization: string;
  ageOfCredit: string;
}

/**
 * Calculate credit score based on bank connection data
 * In a real application, this would use actual financial data
 * This is a simplified simulation for demonstration purposes
 */
export function calculateCreditScore(bankConnections: BankConnection[]): CreditScoreResult {
  // In a production app, we would analyze actual financial data from the bank connections
  // For this demo, we'll simulate scores based on the number and type of connections
  
  // Analyze payment history (simulated)
  let paymentHistoryScore = simulatePaymentHistory(bankConnections);
  let paymentHistoryRating = getRatingFromScore(paymentHistoryScore);
  
  // Analyze credit utilization (simulated)
  let utilizationScore = simulateCreditUtilization(bankConnections);
  let utilizationRating = getRatingFromScore(utilizationScore);
  
  // Analyze credit age (simulated)
  let creditAgeScore = simulateCreditAge(bankConnections);
  let creditAgeRating = getRatingFromScore(creditAgeScore);
  
  // Analyze account mix (simulated)
  let accountMixScore = simulateAccountMix(bankConnections);
  
  // Analyze inquiries (simulated)
  let inquiriesScore = simulateInquiries(bankConnections);
  
  // Calculate weighted score
  let weightedScore = 
    paymentHistoryScore * CREDIT_FACTORS.PAYMENT_HISTORY +
    utilizationScore * CREDIT_FACTORS.CREDIT_UTILIZATION +
    creditAgeScore * CREDIT_FACTORS.CREDIT_AGE +
    accountMixScore * CREDIT_FACTORS.ACCOUNT_MIX +
    inquiriesScore * CREDIT_FACTORS.INQUIRIES;
  
  // Convert to credit score range (300-850)
  const minScore = 300;
  const maxScore = 850;
  const range = maxScore - minScore;
  const actualScore = Math.round(minScore + (weightedScore * range));
  
  return {
    score: actualScore,
    maxScore: 850,
    paymentHistory: paymentHistoryRating,
    utilization: utilizationRating,
    ageOfCredit: creditAgeRating
  };
}

// Helper functions for simulation

function simulatePaymentHistory(connections: BankConnection[]): number {
  // In a real app, we'd analyze payment history from transaction data
  
  // For demo, simulate a score between 0.6 and 1.0 
  // More connections = potentially better history
  const baseScore = 0.6;
  const maxBonus = 0.4;
  const connectionFactor = Math.min(connections.length / 5, 1); // Cap at 5 connections
  
  return baseScore + (maxBonus * connectionFactor);
}

function simulateCreditUtilization(connections: BankConnection[]): number {
  // In a real app, we'd analyze balance vs. credit limit
  
  // For demo, use a random value with some influence from connections
  // More credit_card type connections = potentially worse utilization
  const creditCards = connections.filter(conn => conn.accountType === 'credit_card');
  const otherAccounts = connections.filter(conn => conn.accountType !== 'credit_card');
  
  // Base utilization score - higher is better (lower utilization)
  let baseScore = 0.7 + (Math.random() * 0.2); // Between 0.7 and 0.9
  
  // Credit cards typically increase utilization (decrease score)
  const creditCardPenalty = creditCards.length * 0.05;
  
  // Other accounts may help balance utilization (increase score)
  const otherAccountsBonus = otherAccounts.length * 0.03;
  
  // Calculate final score, ensuring it stays between 0 and 1
  return Math.max(0, Math.min(1, baseScore - creditCardPenalty + otherAccountsBonus));
}

function simulateCreditAge(connections: BankConnection[]): number {
  // In a real app, we'd analyze account age
  
  // For this demo, we'll use connection lastUpdated time as a proxy
  // and add some randomness for demonstration
  
  // Base score between 0.6 and 0.85
  const baseScore = 0.6 + (Math.random() * 0.25);
  
  // Slight bonus for having multiple accounts (diversification)
  const diversificationBonus = Math.min(connections.length * 0.02, 0.1);
  
  return Math.min(1, baseScore + diversificationBonus);
}

function simulateAccountMix(connections: BankConnection[]): number {
  // In a real app, we'd analyze the mix of different account types
  
  // For this demo, we'll check unique account types
  const accountTypes = new Set(connections.map(conn => conn.accountType));
  
  // More diverse account types = better score
  return Math.min(1, 0.7 + (accountTypes.size * 0.08));
}

function simulateInquiries(connections: BankConnection[]): number {
  // In a real app, we'd analyze recent credit inquiries
  
  // For this demo, use random value between 0.8 and 1.0
  // (assuming relatively few inquiries)
  return 0.8 + (Math.random() * 0.2);
}

function getRatingFromScore(score: number): string {
  if (score >= FACTOR_RATINGS.EXCELLENT) return "Excellent";
  if (score >= FACTOR_RATINGS.GOOD) return "Good";
  if (score >= FACTOR_RATINGS.AVERAGE) return "Average";
  if (score >= FACTOR_RATINGS.POOR) return "Poor";
  return "Very Poor";
}
