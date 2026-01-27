// Lightweight shared types for UI and consumers

export type User = {
  id?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  displayName?: string;
  timezone?: string;
  language?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type Expense = {
  id?: number | string;
  amount?: number;
  description?: string;
  category?: string;
  subcategory?: string | null;
  merchantName?: string | null;
  date?: string | Date;
  userId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  paymentMethod?: string | null;
  isRecurring?: boolean;
  tags?: string[];
  notes?: string | null;
  isAutoClassified?: boolean;
  confidence?: string | number | null;
};

export type BillSplitParticipant = {
  id?: number | string;
  billSplitId?: number | string;
  userId?: string | null;
  name?: string;
  email?: string | null;
  amountOwed?: number | string;
  amountPaid?: number | string | null;
  isPaid?: boolean | null;
  createdAt?: string | Date | null;
  isCurrentUser?: boolean;
};

export type BillSplit = {
  id?: number | string;
  name?: string;
  description?: string;
  totalAmount?: number | string;
  date?: string | Date;
  createdBy?: string;
  status?: string;
  participants?: BillSplitParticipant[];
  createdAt?: string | Date;
  userRole?: string;
  createdByName?: string;
};

export type Notification = {
  id?: number | string;
  title?: string;
  message?: string;
  category?: string;
  isRead?: boolean;
  read?: boolean;
  actionUrl?: string | null;
  type?: string;
  createdAt?: string | Date;
};

export type CreditScore = {
  score: number;
  maxScore: number;
  paymentHistory: string;
  utilization: string;
  ageOfCredit: string;
};

export type InsuranceRisk = {
  riskLevel: string;
  healthRisk: string;
  propertyRisk: string;
  autoRisk: string;
};

export type Goal = {
  id?: number | string;
  name?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string | Date;
  category?: string;
  status?: string;
  createdAt?: string | Date;
};
