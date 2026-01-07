import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import { fromZodError } from "zod-validation-error";

// Base validation schemas for common types
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number)
});

export const dateSchema = z.string().datetime().or(z.date());

// Bank Connections schemas
export const createBankConnectionSchema = z.object({
  bankName: z.string().min(1, "Bank name is required").max(100),
  accountNumber: z.string().min(1, "Account number is required").max(50),
  accountType: z.enum(["checking", "savings", "credit_card", "investment"]),
  status: z.enum(["active", "inactive", "pending"]).optional().default("pending"),
  metadata: z.record(z.any()).optional()
});

export const updateBankConnectionSchema = z.object({
  bankName: z.string().min(1).max(100).optional(),
  accountNumber: z.string().min(1).max(50).optional(),
  accountType: z.enum(["checking", "savings", "credit_card", "investment"]).optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  metadata: z.record(z.any()).optional()
});

// Financial Goals schemas
export const createFinancialGoalSchema = z.object({
  name: z.string().min(1, "Goal name is required").max(200),
  targetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").or(z.number().positive()),
  currentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").or(z.number().nonnegative()).optional().default("0"),
  deadline: dateSchema.optional(),
  category: z.enum([
    "savings",
    "investment",
    "emergency_fund",
    "retirement",
    "education",
    "vacation",
    "home",
    "vehicle",
    "debt_payoff",
    "other"
  ]).optional().default("other"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  status: z.enum(["active", "completed", "paused", "abandoned"]).optional().default("active")
});

export const updateFinancialGoalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number().positive()).optional(),
  currentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number().nonnegative()).optional(),
  deadline: dateSchema.optional(),
  category: z.enum([
    "savings",
    "investment",
    "emergency_fund",
    "retirement",
    "education",
    "vacation",
    "home",
    "vehicle",
    "debt_payoff",
    "other"
  ]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["active", "completed", "paused", "abandoned"]).optional()
});

// Expense schemas
export const createExpenseSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").or(z.number().positive("Amount must be positive")),
  category: z.enum([
    "food",
    "transportation",
    "utilities",
    "entertainment",
    "healthcare",
    "shopping",
    "housing",
    "education",
    "insurance",
    "savings",
    "debt",
    "other"
  ]),
  description: z.string().min(1, "Description is required").max(500),
  date: dateSchema,
  merchant: z.string().max(200).optional(),
  paymentMethod: z.enum(["cash", "credit_card", "debit_card", "bank_transfer", "other"]).optional(),
  tags: z.array(z.string()).optional(),
  receiptUrl: z.string().url().optional(),
  isRecurring: z.boolean().optional().default(false),
  metadata: z.record(z.any()).optional()
});

export const updateExpenseSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number().positive()).optional(),
  category: z.enum([
    "food",
    "transportation",
    "utilities",
    "entertainment",
    "healthcare",
    "shopping",
    "housing",
    "education",
    "insurance",
    "savings",
    "debt",
    "other"
  ]).optional(),
  description: z.string().min(1).max(500).optional(),
  date: dateSchema.optional(),
  merchant: z.string().max(200).optional(),
  paymentMethod: z.enum(["cash", "credit_card", "debit_card", "bank_transfer", "other"]).optional(),
  tags: z.array(z.string()).optional(),
  receiptUrl: z.string().url().optional(),
  isRecurring: z.boolean().optional(),
  metadata: z.record(z.any()).optional()
});

// Bill Split schemas
export const billSplitParticipantSchema = z.object({
  name: z.string().min(1, "Participant name is required").max(200),
  email: z.string().email("Invalid email format").optional(),
  shareAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").or(z.number().nonnegative()),
  isPaid: z.boolean().optional().default(false),
  userId: z.string().optional()
});

export const createBillSplitSchema = z.object({
  name: z.string().min(1, "Bill name is required").max(200),
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").or(z.number().positive("Total must be positive")),
  description: z.string().max(1000).optional(),
  date: dateSchema,
  category: z.string().max(100).optional(),
  status: z.enum(["pending", "partially_paid", "fully_paid", "cancelled"]).optional().default("pending"),
  participants: z.array(billSplitParticipantSchema).min(1, "At least one participant required")
});

export const updateBillSplitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number().positive()).optional(),
  description: z.string().max(1000).optional(),
  date: dateSchema.optional(),
  category: z.string().max(100).optional(),
  status: z.enum(["pending", "partially_paid", "fully_paid", "cancelled"]).optional()
});

export const updateBillSplitParticipantSchema = z.object({
  shareAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number().nonnegative()).optional(),
  isPaid: z.boolean().optional(),
  paidAt: dateSchema.optional(),
  paymentMethod: z.string().max(100).optional()
});

// Transaction schemas
export const batchTransactionsSchema = z.object({
  transactions: z.array(z.object({
    accountId: z.number().positive(),
    date: dateSchema,
    description: z.string().min(1).max(500),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number()),
    category: z.string().max(100).optional(),
    merchant: z.string().max(200).optional(),
    type: z.enum(["debit", "credit"]).optional(),
    balance: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.number()).optional(),
    metadata: z.record(z.any()).optional()
  })).min(1, "At least one transaction required")
});

// PD Scoring schemas
export const scoringApplicationSchema = z.object({
  windowDays: z.number().int().positive().min(1).max(365).optional().default(90),
  model: z.enum(["baseline", "xgb"]).optional().default("baseline"),
  features: z.record(z.number()).optional()
});

// Notification schemas
export const updateNotificationSchema = z.object({
  read: z.boolean().optional(),
  archived: z.boolean().optional()
});

// Account schemas
export const createAccountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(200),
  type: z.enum(["checking", "savings", "credit_card", "investment", "loan", "other"]),
  balance: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").or(z.number()),
  currency: z.string().length(3).optional().default("CLP"),
  bankName: z.string().max(100).optional(),
  accountNumber: z.string().max(50).optional(),
  isActive: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional()
});

// Validation middleware factory
export function validateBody<T extends z.ZodType>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          message: "Validation error",
          errors: validationError.details
        });
      }
      next(error);
    }
  };
}

export function validateParams<T extends z.ZodType>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          message: "Invalid parameters",
          errors: validationError.details
        });
      }
      next(error);
    }
  };
}

export function validateQuery<T extends z.ZodType>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          message: "Invalid query parameters",
          errors: validationError.details
        });
      }
      next(error);
    }
  };
}
