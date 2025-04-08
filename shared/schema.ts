import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bank connections table
export const bankConnections = pgTable("bank_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  bankName: text("bank_name").notNull(),
  accountType: text("account_type").notNull(),
  status: text("status").notNull().default("connected"),
  connectionData: jsonb("connection_data"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Credit scores table
export const creditScores = pgTable("credit_scores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
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
  userId: integer("user_id").notNull().references(() => users.id),
  riskLevel: text("risk_level").notNull(),
  healthRisk: text("health_risk").notNull(),
  propertyRisk: text("property_risk").notNull(),
  autoRisk: text("auto_risk").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Financial goals table
export const financialGoals = pgTable("financial_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
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

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  bankConnections: many(bankConnections),
  creditScores: many(creditScores),
  insuranceRisks: many(insuranceRisks),
  financialGoals: many(financialGoals),
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
