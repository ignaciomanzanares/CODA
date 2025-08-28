import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, decimal, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Changed from serial to text to support Auth0 IDs
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  displayName: text("display_name"),
  timezone: text("timezone").default("UTC"),
  language: text("language").default("English"),
  profilePicture: text("profile_picture"),
  userMetadata: jsonb("user_metadata"), // Store additional user preferences
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bank connections table
export const bankConnections = pgTable("bank_connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  bankName: text("bank_name").notNull(),
  accountType: text("account_type").notNull(),
  status: text("status").notNull().default("connected"),
  connectionData: jsonb("connection_data"),
  lastUpdated: timestamp("last_updated").defaultNow(),
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
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Insurance risks table
export const insuranceRisks = pgTable("insurance_risks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  riskLevel: text("risk_level").notNull(),
  healthRisk: text("health_risk").notNull(),
  propertyRisk: text("property_risk").notNull(),
  autoRisk: text("auto_risk").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Financial goals table
export const financialGoals = pgTable("financial_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(),
  currentAmount: integer("current_amount").notNull().default(0),
  targetDate: timestamp("target_date").notNull(),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
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
  requirements: jsonb("requirements"),
  features: jsonb("features"),
});

// Expenses table
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  subcategory: varchar("subcategory", { length: 100 }),
  merchantName: varchar("merchant_name", { length: 255 }),
  date: timestamp("date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  isRecurring: boolean("is_recurring").default(false),
  tags: text("tags").array(),
  notes: text("notes"),
  isAutoClassified: boolean("is_auto_classified").default(true),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bill splits table
export const billSplits = pgTable("bill_splits", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 50 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bill split participants table
export const billSplitParticipants = pgTable("bill_split_participants", {
  id: serial("id").primaryKey(),
  billSplitId: integer("bill_split_id").references(() => billSplits.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  amountOwed: decimal("amount_owed", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),
  isPaid: boolean("is_paid").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // info, warning, success, error
  category: varchar("category", { length: 50 }).notNull(), // bill_split, credit_score, goal, expense, security
  isRead: boolean("is_read").default(false),
  actionUrl: text("action_url"), // Optional URL for click actions
  metadata: jsonb("metadata"), // Additional data for the notification
  createdAt: timestamp("created_at").defaultNow(),
  readAt: timestamp("read_at"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertBankConnectionSchema = createInsertSchema(bankConnections).omit({
  id: true,
  lastUpdated: true,
});

export const insertCreditScoreSchema = createInsertSchema(creditScores).omit({
  id: true,
  lastUpdated: true,
});

export const insertInsuranceRiskSchema = createInsertSchema(insuranceRisks).omit({
  id: true,
  lastUpdated: true,
});

export const insertFinancialGoalSchema = createInsertSchema(financialGoals).omit({
  id: true,
  createdAt: true,
});

export const insertFinancialProductSchema = createInsertSchema(financialProducts).omit({
  id: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
});

export const insertBillSplitSchema = createInsertSchema(billSplits).omit({
  id: true,
  createdAt: true,
});

export const insertBillSplitParticipantSchema = createInsertSchema(billSplitParticipants).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  bankConnections: many(bankConnections),
  creditScores: many(creditScores),
  insuranceRisks: many(insuranceRisks),
  financialGoals: many(financialGoals),
  expenses: many(expenses),
  billSplits: many(billSplits),
  billSplitParticipants: many(billSplitParticipants),
  notifications: many(notifications),
}));

export const bankConnectionsRelations = relations(bankConnections, ({ one }) => ({
  user: one(users, {
    fields: [bankConnections.userId],
    references: [users.id],
  }),
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
