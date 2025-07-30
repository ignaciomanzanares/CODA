// Railway Backend API Integration
const RAILWAY_API_BASE = 'https://wegroup-backend-production.up.railway.app';

export interface FinancialProfile {
  userId: string;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
    bankName: string;
    accountNumber: string;
    isConnected: boolean;
  }>;
  transactions: Array<{
    id: string;
    accountId: string;
    amount: number;
    description: string;
    date: string;
    category: string;
    merchantName?: string;
  }>;
  summary: {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    accountsCount: number;
  };
}

export interface CreditAnalysis {
  user_id: string;
  score: number;
  monthly_income: number;
  monthly_expenses: number;
  savings_rate: number;
  debt_ratio: number;
  risk_factors: string[];
  recommendation: string;
  max_loan_amount: number;
  insights: {
    income_stability: string;
    expense_categories: Record<string, number>;
    spending_patterns: string[];
  };
}

export class RailwayAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = RAILWAY_API_BASE;
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Railway API health check failed:', error);
      throw error;
    }
  }

  async getFinancialProfile(userId: string): Promise<FinancialProfile> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mock/financial-profile?userId=${userId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch financial profile: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch financial profile:', error);
      throw error;
    }
  }

  async getCreditAnalysis(userId: string): Promise<CreditAnalysis> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mock/credit-analysis?userId=${userId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch credit analysis: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch credit analysis:', error);
      throw error;
    }
  }

  async connectBank(userId: string, bankName: string): Promise<{ success: boolean; message: string }> {
    try {
      // First get the financial profile to simulate bank connection
      const profile = await this.getFinancialProfile(userId);
      
      // Check if the bank is already connected
      const bankAccounts = profile.accounts.filter(account => 
        account.bankName.toLowerCase().includes(bankName.toLowerCase())
      );

      if (bankAccounts.length > 0) {
        return {
          success: true,
          message: `Successfully connected to ${bankName}. Found ${bankAccounts.length} account(s).`
        };
      } else {
        return {
          success: false,
          message: `No accounts found for ${bankName}. Please check your credentials.`
        };
      }
    } catch (error) {
      console.error('Bank connection failed:', error);
      return {
        success: false,
        message: `Failed to connect to ${bankName}. Please try again.`
      };
    }
  }
}

export const railwayApi = new RailwayAPI();