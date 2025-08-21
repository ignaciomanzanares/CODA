import { BankConnection, User } from "@shared/schema";

// Risk factors and weights
const RISK_FACTORS = {
  PAYMENT_STABILITY: 0.25,  // Regular stable payments indicate lower risk
  ACCOUNT_BALANCE: 0.20,    // Higher balances indicate lower risk
  ACCOUNT_DIVERSITY: 0.15,  // Diverse accounts indicate lower risk
  TRANSACTION_VOLUME: 0.15, // High transaction volume might indicate higher risk
  USER_PROFILE: 0.25        // User profile data can influence risk assessment
};

// Risk thresholds
const RISK_LEVELS = {
  LOW: 0.35,    // Below this threshold is low risk
  MEDIUM: 0.65  // Below this threshold is medium risk, above is high risk
};

interface InsuranceRiskResult {
  riskLevel: string;
  healthRisk: string;
  propertyRisk: string;
  autoRisk: string;
}

/**
 * Calculate insurance risk based on bank connection data and user profile
 * In a real application, this would use actual financial data
 * This is a simplified simulation for demonstration purposes
 */
export function calculateInsuranceRisk(
  bankConnections: BankConnection[],
  userProfile: User
): InsuranceRiskResult {
  // In a production app, we would analyze actual financial data from the bank connections
  // For this demo, we'll simulate risk assessment
  
  // Analyze payment stability (simulated)
  const paymentStabilityRisk = simulatePaymentStability(bankConnections);
  
  // Analyze account balance (simulated)
  const accountBalanceRisk = simulateAccountBalance(bankConnections);
  
  // Analyze account diversity (simulated)
  const accountDiversityRisk = simulateAccountDiversity(bankConnections);
  
  // Analyze transaction volume (simulated)
  const transactionVolumeRisk = simulateTransactionVolume(bankConnections);
  
  // Analyze user profile (simulated)
  const userProfileRisk = simulateUserProfileRisk(userProfile);
  
  // Calculate weighted risk score (higher score = higher risk)
  const weightedRiskScore = 
    paymentStabilityRisk * RISK_FACTORS.PAYMENT_STABILITY +
    accountBalanceRisk * RISK_FACTORS.ACCOUNT_BALANCE +
    accountDiversityRisk * RISK_FACTORS.ACCOUNT_DIVERSITY +
    transactionVolumeRisk * RISK_FACTORS.TRANSACTION_VOLUME +
    userProfileRisk * RISK_FACTORS.USER_PROFILE;
  
  // Determine overall risk level
  const overallRiskLevel = getRiskLevelFromScore(weightedRiskScore);
  
  // For demonstration, we'll simulate specific risk types with some correlation to overall risk
  // but with individual variations
  const healthRisk = getSpecificRisk(weightedRiskScore, -0.05); // Slightly better than overall
  const propertyRisk = getSpecificRisk(weightedRiskScore, 0.1);  // Slightly worse than overall
  const autoRisk = getSpecificRisk(weightedRiskScore, 0);       // Similar to overall
  
  return {
    riskLevel: overallRiskLevel,
    healthRisk: healthRisk,
    propertyRisk: propertyRisk,
    autoRisk: autoRisk
  };
}

// Helper functions for simulation

function simulatePaymentStability(connections: BankConnection[]): number {
  // In a real app, we'd analyze payment patterns for regularity and consistency
  
  // For demo, more connections of certain types suggest stability
  const savingsAccounts = connections.filter(conn => conn.accountType === 'savings');
  const checkingAccounts = connections.filter(conn => conn.accountType === 'checking');
  
  // Base risk score - higher is riskier
  let baseRisk = 0.5 - (Math.random() * 0.2); // Between 0.3 and 0.5
  
  // Savings accounts typically indicate stability (reduce risk)
  const savingsBonus = savingsAccounts.length * 0.07;
  
  // Checking accounts with regular activity also indicate stability
  const checkingBonus = checkingAccounts.length * 0.05;
  
  // Calculate final risk, ensuring it stays between 0 and 1
  return Math.max(0, Math.min(1, baseRisk - savingsBonus - checkingBonus));
}

function simulateAccountBalance(connections: BankConnection[]): number {
  // In a real app, we'd analyze actual account balances
  
  // For demo, more connections suggest potentially higher balances
  const connectionFactor = Math.min(connections.length / 6, 1); // Cap at 6 connections
  
  // Base risk (higher is riskier)
  const baseRisk = 0.6;
  
  // Connections reduce risk (assumed higher balance)
  const connectionBonus = connectionFactor * 0.4;
  
  return baseRisk - connectionBonus;
}

function simulateAccountDiversity(connections: BankConnection[]): number {
  // In a real app, we'd analyze the mix of different account types
  
  // For demo, check unique account types
  const accountTypes = new Set(connections.map(conn => conn.accountType));
  
  // More diverse account types = lower risk
  return Math.max(0, 0.8 - (accountTypes.size * 0.15));
}

function simulateTransactionVolume(connections: BankConnection[]): number {
  // In a real app, we'd analyze transaction frequency and amounts
  
  // For demo, we'll assume that more connections correlate with more transactions
  const connectionFactor = Math.min(connections.length / 4, 1); // Cap at 4 connections
  
  // Random factor to simulate variation in transaction patterns
  const randomFactor = Math.random() * 0.3;
  
  // Calculate risk (more transactions can be higher risk but also indicate activity)
  return 0.3 + (connectionFactor * 0.3) + randomFactor;
}

function simulateUserProfileRisk(user: User): number {
  // In a real app, we'd use demographic data, history, etc.
  
  // For demo, we'll use a random risk based on user ID for consistency
  // This ensures the same user always gets the same profile risk
  // but different users get different risks
  // Convert string ID to numeric seed for consistent risk calculation
  const userIdSeed = (parseInt(user.id) || user.id.charCodeAt(0) || 42) % 100 / 100; // Value between 0 and 0.99
  
  // Base risk between 0.2 and 0.8
  return 0.2 + (userIdSeed * 0.6);
}

function getRiskLevelFromScore(score: number): string {
  if (score < RISK_LEVELS.LOW) return "Low";
  if (score < RISK_LEVELS.MEDIUM) return "Medium";
  return "High";
}

function getSpecificRisk(baseScore: number, adjustment: number): string {
  // Adjust the base score by the adjustment factor, keeping within 0-1 range
  const adjustedScore = Math.max(0, Math.min(1, baseScore + adjustment));
  return getRiskLevelFromScore(adjustedScore);
}
