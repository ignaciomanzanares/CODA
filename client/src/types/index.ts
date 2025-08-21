// Basic data model interfaces for the FinHealth application

export interface Goal {
  id: number | string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | Date;
  category: 'savings' | 'debt_repayment' | 'retirement' | 'home' | 'education' | 'other';
  userId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateGoalData {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  category: 'savings' | 'debt_repayment' | 'retirement' | 'home' | 'education' | 'other';
}

export interface UpdateGoalData extends Partial<CreateGoalData> {}

export interface Expense {
  id: number | string;
  amount: string | number;
  description: string;
  category: string;
  subcategory?: string;
  merchantName?: string;
  date: string | Date;
  paymentMethod?: string;
  isRecurring?: boolean;
  tags?: string[];
  notes?: string;
  isAutoClassified?: boolean;
  userId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateExpenseData {
  amount: string | number;
  description: string;
  category: string;
  subcategory?: string;
  merchantName?: string;
  date: Date;
  paymentMethod?: string;
  isRecurring?: boolean;
  tags?: string[];
  notes?: string;
  isAutoClassified?: boolean;
}

export interface UpdateExpenseData extends Partial<CreateExpenseData> {}

export interface BankConnection {
  id: number | string;
  bankName: string;
  accountType: string;
  accountNumber?: string;
  isConnected: boolean;
  userId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateBankConnectionData {
  bankName: string;
  accountType: string;
  accountNumber?: string;
  isConnected?: boolean;
}

export interface BillSplit {
  id: number | string;
  name: string;
  description?: string;
  totalAmount: number;
  createdBy: string;
  participants?: BillSplitParticipant[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface BillSplitParticipant {
  id: number | string;
  billSplitId: number | string;
  userId: string;
  name?: string;
  email?: string;
  amountOwed: string;
  amountPaid?: string | null;
  amount: number;
  isPaid?: boolean;
  isCurrentUser?: boolean;
  createdAt?: string | Date;
}

export interface CreateBillSplitData {
  name: string;
  description?: string;
  totalAmount: number;
  date: Date;
  participants?: Omit<BillSplitParticipant, 'id' | 'billSplitId'>[];
}

// Helper interface for creating participants with optional email
export interface CreateBillSplitParticipant {
  name: string;
  email?: string; // Optional email for invitations
  phone?: string; // Optional phone for SMS invites (future)
  amount: number; // Their share of the bill
  isPaid?: boolean;
}

export interface UpdateBillSplitData extends Partial<CreateBillSplitData> {}

export interface UpdateBillSplitParticipantData {
  amount?: number;
  isPaid?: boolean;
}

export interface ProfileData {
  displayName?: string;
  email?: string;
  timezone?: string;
  language?: string;
}

// Filter types for components
export interface BasicFilters {
  type: string;
  rate: string;
  term: string;
}

export interface AdvancedFilters {
  minAmount: number;
  maxAmount: number;
  requiresCollateral: boolean;
  onlineApplication: boolean;
  preApproved: boolean;
}

export type AllFilters = BasicFilters & AdvancedFilters;

export type FilterValue = string | number | boolean;

export interface ProductFilter {
  type?: string;
  rate?: string;
  term?: string;
  minAmount?: number;
  maxAmount?: number;
}

// Financial Product types
export interface BaseFinancialProduct {
  id: string | number;
  provider: string;
  productType: string;
  interestRate?: number;
  features?: Record<string, unknown>;
}

export interface LoanProduct extends BaseFinancialProduct {
  monthlyPayment: number;
  loanAmount: number;
  term: number;
  termUnit: string;
}

export interface CreditCardProduct extends BaseFinancialProduct {
  features?: {
    annualFee?: number;
    rewardsRate?: number;
    [key: string]: unknown;
  };
}

export interface SavingsProduct extends BaseFinancialProduct {
  features?: {
    minimumBalance?: number;
    [key: string]: unknown;
  };
}

export interface InsuranceProduct extends BaseFinancialProduct {
  features?: {
    replacementCost?: boolean;
    [key: string]: unknown;
  };
}

export type FinancialProduct = LoanProduct | CreditCardProduct | SavingsProduct | InsuranceProduct;

// API Response wrapper type (for cases where we don't know the exact response shape)
export interface ApiResponse<T = unknown> {
  data?: T;
  message?: string;
  error?: string;
}
