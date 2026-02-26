// --- Additional tables for full MVP coverage ---

// Credit score history
export const creditScoreHistory = pgTable("credit_score_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  score: integer("score").notNull(),
  maxScore: integer("max_score").notNull().default(850),
  calculatedAt: text("calculated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  factors: text("factors"), // JSON string for SHAP/factor breakdown
});

// Goal progress
export const goalProgress = pgTable("goal_progress", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => financialGoals.id),
  userId: text("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  progressDate: text("progress_date").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Audit logs
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`).notNull(),
  details: text("details"), // JSON string
  ip: text("ip"),
});

// Expense categories
export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id"), // Remove circular reference
  description: text("description"),
});

// Risk factors
export const riskFactors = pgTable("risk_factors", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  type: text("type").notNull(),
  value: text("value").notNull(),
  score: integer("score"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Product recommendations
export const productRecommendations = pgTable("product_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => financialProducts.id),
  recommendedAt: text("recommended_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  reason: text("reason"),
  status: text("status").default("pending"), // pending, applied, rejected
});
import { pgTable, text, integer, real, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Text ID to support JWT user IDs
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // For JWT auth (nullable for demo users)
  firstName: text("first_name"),
  lastName: text("last_name"),
  displayName: text("display_name"),
  timezone: text("timezone").default("UTC"),
  language: text("language").default("English"),
  profilePicture: text("profile_picture"),
  userMetadata: text("user_metadata"), // JSON string for additional user preferences
  twoFactorEnabled: integer("two_factor_enabled").default(0), // 0 = false, 1 = true
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// -----------------------------------------------------------------------------
// Open Banking data model (accounts, balances, transactions)
// -----------------------------------------------------------------------------

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  bankConnectionId: integer("bank_connection_id"), // Add references if bankConnections is defined as pgTable
  providerAccountId: text("provider_account_id"), // external provider ID
  name: text("name"),
  officialName: text("official_name"),
  type: text("type"), // checking/savings/credit_card/loan/etc
  subtype: text("subtype"),
  currency: text("currency"),
  mask: text("mask"),
  status: text("status").default("active"),
  openedAt: text("opened_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const balances = pgTable("balances", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  asOf: text("as_of").default(sql`CURRENT_TIMESTAMP`).notNull(),
  current: real("current").notNull(),
  available: real("available"),
  creditLimit: real("credit_limit"),
  currency: text("currency"),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  externalId: text("external_id"),
  postedAt: text("posted_at").notNull(),
  description: text("description"),
  merchantName: text("merchant_name"),
  amount: real("amount").notNull(),
  currency: text("currency"),
  category: text("category"),
  subcategory: text("subcategory"),
  pending: integer("pending").default(0),
  raw: text("raw"), // JSON string
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Bank connections table
export const bankConnections = pgTable("bank_connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  bankName: text("bank_name").notNull(),
  accountType: text("account_type").notNull(),
  status: text("status").notNull().default("connected"),
  connectionData: text("connection_data"), // JSON string
  lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Credit scores table
export const creditScores = pgTable("credit_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  score: integer("score").notNull(),
  maxScore: integer("max_score").notNull().default(850),
  paymentHistory: text("payment_history").notNull(),
  utilization: text("utilization").notNull(),
  ageOfCredit: text("age_of_credit").notNull(),
  lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Insurance risks table
export const insuranceRisks = pgTable("insurance_risks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  riskLevel: text("risk_level").notNull(),
  healthRisk: text("health_risk").notNull(),
  propertyRisk: text("property_risk").notNull(),
  autoRisk: text("auto_risk").notNull(),
  lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Financial goals table
export const financialGoals = pgTable("financial_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(),
  currentAmount: integer("current_amount").notNull().default(0),
  targetDate: text("target_date").notNull(),
  category: text("category").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Financial products table
export const financialProducts = pgTable("financial_products", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  provider: text("provider").notNull(),
  productType: text("product_type").notNull(),
  category: text("category").notNull(), // loans, credit_cards, savings, insurance
  interestRate: real("interest_rate"),
  term: integer("term"),
  termUnit: text("term_unit"), // months, years
  monthlyPayment: integer("monthly_payment"),
  loanAmount: integer("loan_amount"),
  description: text("description"),
  requirements: text("requirements"), // JSON string
  features: text("features"), // JSON string
});

// Expenses table
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  name: text("name"), // optional label for the expense
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  merchantName: text("merchant_name"),
  date: text("date").notNull(),
  paymentMethod: text("payment_method"),
  isRecurring: integer("is_recurring").default(0),
  tags: text("tags"), // JSON array string
  notes: text("notes"),
  isAutoClassified: integer("is_auto_classified").default(1),
  confidence: real("confidence"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Bill splits table
export const billSplits = pgTable("bill_splits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  totalAmount: real("total_amount").notNull(),
  description: text("description"),
  date: text("date").notNull(),
  createdBy: text("created_by").references(() => users.id).notNull(),
  status: text("status").default("active"), // active, settled, deleted
  shareCode: text("share_code"), // Unique code for shareable links
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Bill split participants table
export const billSplitParticipants = pgTable("bill_split_participants", {
  id: serial("id").primaryKey(),
  billSplitId: integer("bill_split_id").references(() => billSplits.id).notNull(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  email: text("email"),
  amountOwed: real("amount_owed").notNull(),
  amountPaid: real("amount_paid").default(0),
  isPaid: integer("is_paid").default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // info, warning, success, error
  category: text("category").notNull(), // bill_split, credit_score, goal, expense, security
  isRead: integer("is_read").default(0),
  actionUrl: text("action_url"), // Optional URL for click actions
  metadata: text("metadata"), // JSON string for additional data
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  readAt: text("read_at"),
});

// Insert schemas - use createInsertSchema without .omit() to avoid type issues
export const insertUserSchema = createInsertSchema(users);
export const insertAccountSchema = createInsertSchema(accounts);
export const insertBalanceSchema = createInsertSchema(balances);
export const insertTransactionSchema = createInsertSchema(transactions);
export const insertBankConnectionSchema = createInsertSchema(bankConnections);
export const insertCreditScoreSchema = createInsertSchema(creditScores);
export const insertInsuranceRiskSchema = createInsertSchema(insuranceRisks);
export const insertFinancialGoalSchema = createInsertSchema(financialGoals);
export const insertFinancialProductSchema = createInsertSchema(financialProducts);
export const insertExpenseSchema = createInsertSchema(expenses);
export const insertBillSplitSchema = createInsertSchema(billSplits);
export const insertBillSplitParticipantSchema = createInsertSchema(billSplitParticipants);
export const insertNotificationSchema = createInsertSchema(notifications);
export const insertCreditScoreHistorySchema = createInsertSchema(creditScoreHistory);
export const insertGoalProgressSchema = createInsertSchema(goalProgress);
export const insertAuditLogSchema = createInsertSchema(auditLogs);
export const insertExpenseCategorySchema = createInsertSchema(expenseCategories);
export const insertRiskFactorSchema = createInsertSchema(riskFactors);
export const insertProductRecommendationSchema = createInsertSchema(productRecommendations);

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  bankConnections: many(bankConnections),
  accounts: many(accounts),
  creditScores: many(creditScores),
  insuranceRisks: many(insuranceRisks),
  financialGoals: many(financialGoals),
  expenses: many(expenses),
  billSplits: many(billSplits),
  billSplitParticipants: many(billSplitParticipants),
  notifications: many(notifications),
}));

export const bankConnectionsRelations = relations(bankConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [bankConnections.userId],
    references: [users.id],
  }),
  accounts: many(accounts)
}));

export const creditScoresRelations = relations(creditScores, ({ one }) => ({
  user: one(users, {
    fields: [creditScores.userId],
    references: [users.id],
  }),
}));

export const insuranceRisksRelations = relations(insuranceRisks, ({ one }) => ({
  user: one(users, {
    fields: [insuranceRisks.userId],
    references: [users.id],
  }),
}));

export const financialGoalsRelations = relations(financialGoals, ({ one }) => ({
  user: one(users, {
    fields: [financialGoals.userId],
    references: [users.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  user: one(users, { fields: [expenses.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  bankConnection: one(bankConnections, { fields: [accounts.bankConnectionId], references: [bankConnections.id] }),
  balances: many(balances),
  transactions: many(transactions),
}));

export const balancesRelations = relations(balances, ({ one }) => ({
  account: one(accounts, { fields: [balances.accountId], references: [accounts.id] })
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] })
}));

export const billSplitsRelations = relations(billSplits, ({ one, many }) => ({
  createdByUser: one(users, { fields: [billSplits.createdBy], references: [users.id] }),
  participants: many(billSplitParticipants),
}));

export const billSplitParticipantsRelations = relations(billSplitParticipants, ({ one }) => ({
  billSplit: one(billSplits, { fields: [billSplitParticipants.billSplitId], references: [billSplits.id] }),
  user: one(users, { fields: [billSplitParticipants.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

export type InsertBalance = z.infer<typeof insertBalanceSchema>;
export type Balance = typeof balances.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertBankConnection = z.infer<typeof insertBankConnectionSchema>;
export type BankConnection = typeof bankConnections.$inferSelect;

export type InsertCreditScore = z.infer<typeof insertCreditScoreSchema>;
export type CreditScore = typeof creditScores.$inferSelect;

export type InsertInsuranceRisk = z.infer<typeof insertInsuranceRiskSchema>;
export type InsuranceRisk = typeof insuranceRisks.$inferSelect;

export type InsertFinancialGoal = z.infer<typeof insertFinancialGoalSchema>;
export type FinancialGoal = typeof financialGoals.$inferSelect;

export type InsertFinancialProduct = z.infer<typeof insertFinancialProductSchema>;
export type FinancialProduct = typeof financialProducts.$inferSelect;

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

export type InsertBillSplit = z.infer<typeof insertBillSplitSchema>;
export type BillSplit = typeof billSplits.$inferSelect;

export type InsertBillSplitParticipant = z.infer<typeof insertBillSplitParticipantSchema>;
export type BillSplitParticipant = typeof billSplitParticipants.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertCreditScoreHistory = z.infer<typeof insertCreditScoreHistorySchema>;
export type CreditScoreHistory = typeof creditScoreHistory.$inferSelect;

export type InsertGoalProgress = z.infer<typeof insertGoalProgressSchema>;
export type GoalProgress = typeof goalProgress.$inferSelect;

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;

export type InsertRiskFactor = z.infer<typeof insertRiskFactorSchema>;
export type RiskFactor = typeof riskFactors.$inferSelect;

export type InsertProductRecommendation = z.infer<typeof insertProductRecommendationSchema>;
export type ProductRecommendation = typeof productRecommendations.$inferSelect;

// Temporary minimal domain types to satisfy references in this module.
// Replace with concrete shapes once the domain models are implemented.
export type Settlement = { [key: string]: unknown };
export type BillSplitActivity = { [key: string]: unknown };

// Extended types with additional properties
export type BillSplitParticipantWithUser = BillSplitParticipant & {
  isCurrentUser?: boolean;
  userName?: string;
};

export type BillSplitWithParticipants = BillSplit & {
  participants: BillSplitParticipantWithUser[];
  userRole?: 'creator' | 'participant' | 'none';
  createdByName?: string;
};

export type UserBalance = {
  userId: string;
  userName: string;
  email?: string;
  balance: number; // positive = they owe you, negative = you owe them
};

export type SettlementWithUsers = Settlement & {
  fromUserName: string;
  toUserName: string;
};

export type ActivityFeedItem = BillSplitActivity & {
  userName: string;
  userAvatar?: string;
};
