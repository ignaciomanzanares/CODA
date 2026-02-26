import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import { fromZodError } from "zod-validation-error";

// Base validation schemas for common types
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number)
});

// Flexible date schema that accepts multiple formats
export const dateSchema = z.union([
  z.string().datetime(), // ISO 8601 with time: 2026-01-21T10:30:00Z
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Simple date: 2026-01-21
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), // ISO without Z
  z.date(), // Date object
]);

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
  targetAmount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    z.number().positive()
  ]),
  currentAmount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    z.number().nonnegative()
  ]).optional().default(0),
  targetDate: dateSchema,
  category: z.string().max(100).optional().default("other"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  status: z.enum(["active", "completed", "paused", "abandoned"]).optional().default("active")
}).passthrough();

export const updateFinancialGoalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetAmount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/),
    z.number().positive()
  ]).optional(),
  currentAmount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/),
    z.number().nonnegative()
  ]).optional(),
  targetDate: dateSchema.optional(),
  category: z.string().max(100).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["active", "completed", "paused", "abandoned"]).optional()
}).passthrough();

// Expense schemas
export const createExpenseSchema = z.object({
  amount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    z.number().positive("Amount must be positive")
  ]),
  name: z.string().max(200).optional().or(z.literal("")),
  category: z.string().min(1, "Category is required").max(100),
  description: z.string().min(1, "Description is required").max(500),
  date: dateSchema,
  merchant: z.string().max(200).optional().or(z.literal("")),
  merchantName: z.string().max(200).optional().or(z.literal("")),
  subcategory: z.string().max(100).optional().or(z.literal("")),
  paymentMethod: z.string().max(50).optional().or(z.literal("")),
  tags: z.array(z.string()).optional().or(z.null()),
  notes: z.string().max(1000).optional().or(z.literal("")),
  receiptUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  isRecurring: z.boolean().optional().default(false),
  isAutoClassified: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional().or(z.null())
}).passthrough(); // Allow extra fields without failing

export const updateExpenseSchema = z.object({
  amount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/),
    z.number().positive()
  ]).optional(),
  name: z.string().max(200).optional().or(z.literal("")),
  category: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  date: dateSchema.optional(),
  merchant: z.string().max(200).optional().or(z.literal("")),
  merchantName: z.string().max(200).optional().or(z.literal("")),
  subcategory: z.string().max(100).optional().or(z.literal("")),
  paymentMethod: z.string().max(50).optional().or(z.literal("")),
  tags: z.array(z.string()).optional().or(z.null()),
  notes: z.string().max(1000).optional().or(z.literal("")),
  receiptUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  isRecurring: z.boolean().optional(),
  isAutoClassified: z.boolean().optional(),
  metadata: z.record(z.any()).optional().or(z.null())
}).passthrough(); // Allow extra fields without failing

// Bill Split schemas
export const billSplitParticipantSchema = z.object({
  name: z.string().min(1, "Participant name is required").max(200),
  email: z.string().email("Invalid email format").optional().or(z.literal("")).or(z.null()),
  amountOwed: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    z.number().nonnegative()
  ]).optional(), // Optional - will be calculated for equal splits
  amountPaid: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/),
    z.number().nonnegative()
  ]).optional().default(0),
  isPaid: z.boolean().optional().default(false),
  userId: z.string().optional().or(z.null())
});

export const createBillSplitSchema = z.object({
  name: z.string().min(1, "Bill name is required").max(200),
  totalAmount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    z.number().positive("Total must be positive")
  ]),
  description: z.string().max(1000).optional().or(z.literal("")),
  date: dateSchema.optional(), // Optional - defaults to today
  category: z.string().max(100).optional().or(z.literal("")),
  splitType: z.enum(["equal", "exact", "percentage", "shares"]).optional().default("equal"),
  status: z.enum(["pending", "partially_paid", "fully_paid", "cancelled"]).optional().default("pending"),
  participants: z.array(billSplitParticipantSchema).min(1, "At least one participant required"),
  alsoAddToExpenses: z.boolean().optional().default(false),
}).passthrough();

export const updateBillSplitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  totalAmount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/),
    z.number().positive()
  ]).optional(),
  description: z.string().max(1000).optional().or(z.literal("")),
  date: dateSchema.optional(),
  category: z.string().max(100).optional().or(z.literal("")),
  status: z.enum(["pending", "partially_paid", "fully_paid", "cancelled"]).optional()
}).passthrough();

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
