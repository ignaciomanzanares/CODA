import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { registerEmpresasRoutes } from "./routes-empresas.js";
import { registerConsentRoutes } from "./routes-consent.js";
import { registerTestRoutes } from "./routes-test.js";
import { storage } from "./storage.js";
import { db, dialect, users, bankConnections, accounts, balances, transactions, creditScores, insuranceRisks, financialGoals, financialProducts, expenses, billSplits, billSplitParticipants, notifications, eq, and, inArray, isNull, desc, insertAccountSchema, insertBankConnectionSchema, insertFinancialGoalSchema } from "./db/index.js";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { 
  authenticate, 
  ensureUserForToken,
  handleLogin, 
  handleLoginWithDB,
  handleLogout, 
  handleMe, 
  handleRegister,
  handleVerify2FA,
  handleEnable2FA,
  handleDisable2FA,
  handleResend2FA,
  type AuthenticatedRequest 
} from "./middleware/auth.js";
import { emailService } from "./services/emailService.js";
import crypto from "crypto";
import { notificationService } from "./services/notificationService.js";
import { apiLimiter, expensiveLimiter, authLimiter } from "./middleware/rateLimiter.js";
import multer from "multer";
import { logger } from "./logger.js";
import {
  validateBody,
  validateParams,
  idParamSchema,
  createBankConnectionSchema,
  updateBankConnectionSchema,
  createFinancialGoalSchema,
  updateFinancialGoalSchema,
  createExpenseSchema,
  updateExpenseSchema,
  createBillSplitSchema,
  updateBillSplitSchema,
  updateBillSplitParticipantSchema,
  batchTransactionsSchema,
  scoringApplicationSchema,
  createAccountSchema
} from "./middleware/validation.js";

// Helper to get user ID from JWT
function getUserIdFromAuth(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  return authReq.user?.userId || '';
}

// Helper to resolve ML artifacts directory
// Supports running from repo root, apps/api, or compiled output
async function getMLArtifactsDir(): Promise<string> {
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");
  
  const possiblePaths = [
    pathMod.join(process.cwd(), "apps", "api", "src", "ml", "artifacts", "current"),
    pathMod.join(process.cwd(), "src", "ml", "artifacts", "current"),
  ];
  
  for (const p of possiblePaths) {
    if (fsMod.existsSync(p)) return p;
  }
  
  // Default fallback
  return possiblePaths[0];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint (no auth required)
  app.get("/health", async (_req, res) => {
    try {
      // Import DB dynamically; the module may export `db` or fall back to undefined
      const dbModule: any = await import("./db/index.js");
      const db = dbModule.db;
      const dbHealthy = !!db;
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const mlReady = PDModelRegistry.instance().isReady;
      
      const status = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          database: dbHealthy ? "connected" : "in-memory",
          ml_model: mlReady ? "ready" : "loading",
          auth: "jwt",
        },
        version: process.env.npm_package_version || "1.0.0",
      };
      
      res.status(200).json(status);
    } catch (_error) {
      res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      });
    }
  });

  // Auth routes
  app.post("/api/auth/register", authLimiter, handleRegister);
  app.post("/api/auth/login", authLimiter, handleLoginWithDB);
  app.post("/api/auth/logout", authenticate, handleLogout);
  app.get("/api/auth/me", authenticate, handleMe);
  
  // 2FA routes
  app.post("/api/auth/2fa/verify", authLimiter, handleVerify2FA);
  app.post("/api/auth/2fa/resend", authLimiter, handleResend2FA);
  app.post("/api/auth/2fa/enable", authenticate, handleEnable2FA);
  app.post("/api/auth/2fa/disable", authenticate, handleDisable2FA);

  // Error handling middleware
  const handleZodError = (err: unknown, _req: Request, res: Response, next: (...args: unknown[]) => unknown) => {
    if (err instanceof ZodError) {
      const validationError = fromZodError(err);
      return res.status(400).json({ 
        message: "Validation error", 
        errors: validationError.details 
      });
    }
    next(err);
  };

  app.use("/api", handleZodError);

  // Apply rate limiting to all API routes
  app.use("/api", apiLimiter);

  // CODA Empresas API (misma BD, prefijo /api/empresas)
  registerEmpresasRoutes(app);

  // Panel de Control de Consentimientos (RAR + Grant Management)
  registerConsentRoutes(app);

  // Simulación de flujo bancario (consent + webhook + mock SFA + score)
  registerTestRoutes(app);

  // --- Protected routes (require JWT authentication) ---

  // ==========================================================================
  // FINANCIAL SUMMARY & DASHBOARD DATA
  // ==========================================================================

  /**
   * GET /api/financial-summary
   * Comprehensive financial overview for dashboard
   * Returns: accounts by type, balances, net worth, trends, cash flow
   */
  app.get("/api/financial-summary", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      // Get all accounts for user
      const userAccounts = await storage.getAccounts(userId);
      
      // Get latest balances for each account
      const accountsWithBalances = await Promise.all(
        userAccounts.map(async (account: { id: number; type?: string; subtype?: string; name?: string; officialName?: string; bankConnectionId?: number }) => {
          const balances = await storage.getBalances(account.id);
          const balance = balances.length > 0 ? balances[balances.length - 1] : null;
          return { ...account, balance };
        })
      );

      // Categorize accounts
      const accountsByType = {
        checking: accountsWithBalances.filter((a: any) => a.type === 'checking' || a.type === 'depository'),
        savings: accountsWithBalances.filter((a: any) => a.type === 'savings'),
        creditCards: accountsWithBalances.filter((a: any) => a.type === 'credit' || a.subtype === 'credit card'),
        loans: accountsWithBalances.filter((a: any) => a.type === 'loan' || a.subtype === 'line of credit'),
        investments: accountsWithBalances.filter((a: any) => a.type === 'investment' || a.type === 'brokerage'),
      };

      // Calculate totals
      const calculateTotal = (accounts: any[]) => 
        accounts.reduce((sum: number, a: any) => sum + parseFloat(a.balance?.current || '0'), 0);

      const checkingTotal = calculateTotal(accountsByType.checking);
      const savingsTotal = calculateTotal(accountsByType.savings);
      const investmentsTotal = calculateTotal(accountsByType.investments);
      const creditCardDebt = Math.abs(calculateTotal(accountsByType.creditCards));
      const loansTotal = Math.abs(calculateTotal(accountsByType.loans));

      const totalAssets = checkingTotal + savingsTotal + investmentsTotal;
      const totalLiabilities = creditCardDebt + loansTotal;
      const netWorth = totalAssets - totalLiabilities;

      // Get transactions for the last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const allTransactions = await Promise.all(
        userAccounts.map((account: { id: number }) => storage.getTransactions(account.id, { from: ninetyDaysAgo }))
      );
      const transactions = allTransactions.flat().filter((t: any) => 
        new Date(t.postedAt) >= ninetyDaysAgo
      );

      // Calculate monthly income and expenses (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentTransactions = transactions.filter((t: any) => new Date(t.postedAt) >= thirtyDaysAgo);
      
      const monthlyIncome = recentTransactions
        .filter((t: any) => parseFloat(t.amount) > 0)
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
      
      const monthlyExpenses = Math.abs(recentTransactions
        .filter((t: any) => parseFloat(t.amount) < 0)
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0));

      const savingsRate = monthlyIncome > 0 
        ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) 
        : 0;

      // Spending by category (last 30 days)
      const spendingByCategory: Record<string, number> = {};
      recentTransactions
        .filter((t: any) => parseFloat(t.amount) < 0)
        .forEach((t: any) => {
          const category = t.category || 'Other';
          spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(parseFloat(t.amount));
        });

      // Generate net worth trend (last 6 months - simulated based on current)
      const netWorthTrend = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        // Simulate growth trend (in production, calculate from historical data)
        const variance = 1 - (i * 0.02) + (Math.random() * 0.02);
        netWorthTrend.push({
          month: monthLabel,
          netWorth: Math.round(netWorth * variance),
          assets: Math.round(totalAssets * variance),
          liabilities: Math.round(totalLiabilities * (1 + (i * 0.01))),
        });
      }

      // Monthly cash flow (last 6 months)
      const cashFlowTrend = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });
        // Simulate cash flow (in production, calculate from historical transactions)
        const incomeVariance = 0.9 + (Math.random() * 0.2);
        const expenseVariance = 0.85 + (Math.random() * 0.3);
        cashFlowTrend.push({
          month: monthLabel,
          income: Math.round(monthlyIncome * incomeVariance),
          expenses: Math.round(monthlyExpenses * expenseVariance),
        });
      }

      // Top spending categories
      const topCategories = Object.entries(spendingByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, amount]) => ({
          name,
          amount: Math.round(amount * 100) / 100,
          percentage: Math.round((amount / monthlyExpenses) * 100) || 0,
        }));

      res.json({
        summary: {
          totalBalance: Math.round(checkingTotal + savingsTotal),
          totalAssets: Math.round(totalAssets),
          totalLiabilities: Math.round(totalLiabilities),
          netWorth: Math.round(netWorth),
          monthlyIncome: Math.round(monthlyIncome),
          monthlyExpenses: Math.round(monthlyExpenses),
          savingsRate,
          accountCount: userAccounts.length,
        },
        accountsByType: {
          checking: {
            count: accountsByType.checking.length,
            total: Math.round(checkingTotal),
            accounts: accountsByType.checking.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: parseFloat(a.balance?.current || '0'),
              institution: a.bankConnectionId,
            })),
          },
          savings: {
            count: accountsByType.savings.length,
            total: Math.round(savingsTotal),
            accounts: accountsByType.savings.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: parseFloat(a.balance?.current || '0'),
            })),
          },
          creditCards: {
            count: accountsByType.creditCards.length,
            total: Math.round(creditCardDebt),
            accounts: accountsByType.creditCards.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: Math.abs(parseFloat(a.balance?.current || '0')),
              limit: parseFloat(a.balance?.creditLimit || '0'),
            })),
          },
          loans: {
            count: accountsByType.loans.length,
            total: Math.round(loansTotal),
            accounts: accountsByType.loans.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: Math.abs(parseFloat(a.balance?.current || '0')),
            })),
          },
          investments: {
            count: accountsByType.investments.length,
            total: Math.round(investmentsTotal),
            accounts: accountsByType.investments.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: parseFloat(a.balance?.current || '0'),
            })),
          },
        },
        trends: {
          netWorth: netWorthTrend,
          cashFlow: cashFlowTrend,
        },
        spending: {
          total: Math.round(monthlyExpenses),
          byCategory: topCategories,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching financial summary");
      res.status(500).json({ message: "Failed to fetch financial summary" });
    }
  });

  /**
   * GET /api/financial-summary/demo
   * Demo financial summary with realistic sample data
   */
  app.get("/api/financial-summary/demo", async (_req, res) => {
    const demoData = {
      summary: {
        totalBalance: 24562.80,
        totalAssets: 156850,
        totalLiabilities: 14500,
        netWorth: 142350,
        monthlyIncome: 7500,
        monthlyExpenses: 3845.20,
        savingsRate: 49,
        accountCount: 5,
      },
      accountsByType: {
        checking: {
          count: 2,
          total: 8562.80,
          accounts: [
            { id: 1, name: "Main Checking", balance: 6234.50, institution: "Chase" },
            { id: 2, name: "Bills Account", balance: 2328.30, institution: "BofA" },
          ],
        },
        savings: {
          count: 1,
          total: 16000,
          accounts: [
            { id: 3, name: "Emergency Fund", balance: 16000, institution: "Ally" },
          ],
        },
        creditCards: {
          count: 2,
          total: 2500,
          accounts: [
            { id: 4, name: "Sapphire Reserve", balance: 1800, limit: 15000 },
            { id: 5, name: "Amex Gold", balance: 700, limit: 10000 },
          ],
        },
        loans: {
          count: 1,
          total: 12000,
          accounts: [
            { id: 6, name: "Auto Loan", balance: 12000 },
          ],
        },
        investments: {
          count: 2,
          total: 132287.20,
          accounts: [
            { id: 7, name: "401(k)", balance: 98500 },
            { id: 8, name: "Brokerage", balance: 33787.20 },
          ],
        },
      },
      trends: {
        netWorth: [
          { month: "Aug '25", netWorth: 128500, assets: 142000, liabilities: 13500 },
          { month: "Sep '25", netWorth: 131200, assets: 145500, liabilities: 14300 },
          { month: "Oct '25", netWorth: 134800, assets: 149200, liabilities: 14400 },
          { month: "Nov '25", netWorth: 137500, assets: 152000, liabilities: 14500 },
          { month: "Dec '25", netWorth: 140100, assets: 154800, liabilities: 14700 },
          { month: "Jan '26", netWorth: 142350, assets: 156850, liabilities: 14500 },
        ],
        cashFlow: [
          { month: "Aug", income: 7200, expenses: 4100 },
          { month: "Sep", income: 7500, expenses: 3800 },
          { month: "Oct", income: 7500, expenses: 4200 },
          { month: "Nov", income: 7800, expenses: 3900 },
          { month: "Dec", income: 8200, expenses: 5100 },
          { month: "Jan", income: 7500, expenses: 3845 },
        ],
      },
      spending: {
        total: 3845.20,
        byCategory: [
          { name: "Housing", amount: 1500, percentage: 39 },
          { name: "Food & Dining", amount: 680, percentage: 18 },
          { name: "Transportation", amount: 420, percentage: 11 },
          { name: "Utilities", amount: 285, percentage: 7 },
          { name: "Entertainment", amount: 340, percentage: 9 },
          { name: "Shopping", amount: 620.20, percentage: 16 },
        ],
      },
    };

    res.json(demoData);
  });

  // ==========================================================================
  // AI FINANCIAL ASSISTANT
  // ==========================================================================

  /**
   * POST /api/assistant/chat
   * Chat with the AI financial assistant
   */
  app.post("/api/assistant/chat", authenticate, async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Dynamically import the AI service
      const { chat } = await import('./services/aiService.js');

      // Get user's financial context
      const userId = getUserIdFromAuth(req);
      
      // Build financial context from user data
      let financialContext: any = {};
      
      try {
        // Get accounts and balances
        const userAccounts = await storage.getAccounts(userId);
        const accountsWithBalances = await Promise.all(
          userAccounts.map(async (account: { id: number }) => {
            const balances = await storage.getBalances(account.id);
            const balance = balances.length > 0 ? balances[balances.length - 1] : null;
            return { ...account, balance };
          })
        );
        
        // Calculate totals
        const totalBalance = accountsWithBalances.reduce((sum: number, a: any) => 
          sum + parseFloat(a.balance?.current || '0'), 0);
        
        // Get credit score
        const creditScoreData = await storage.getCreditScore(userId);

        // Get financial goals
        const goals = await storage.getFinancialGoals(userId);

        financialContext = {
          totalBalance: Math.round(totalBalance),
          monthlyIncome: 7500, // Would need income tracking feature
          monthlyExpenses: 3845, // Would calculate from transactions
          savingsRate: 28,
          netWorth: Math.round(totalBalance * 1.5), // Simplified
          creditScore: creditScoreData?.score || 720,
          topSpendingCategories: [
            { name: 'Housing', amount: 1500 },
            { name: 'Food & Dining', amount: 680 },
            { name: 'Transportation', amount: 420 },
          ],
          financialGoals: goals.slice(0, 5).map((g: any) => ({
            name: g.name,
            progress: Math.round((g.currentAmount / g.targetAmount) * 100),
          })),
        };
      } catch (_e) {
        // Use demo context if we can't fetch real data
        financialContext = {
          totalBalance: 24562,
          monthlyIncome: 7500,
          monthlyExpenses: 3845,
          savingsRate: 28,
          netWorth: 142350,
          creditScore: 720,
          topSpendingCategories: [
            { name: 'Housing', amount: 1500 },
            { name: 'Food & Dining', amount: 680 },
            { name: 'Transportation', amount: 420 },
          ],
          financialGoals: [
            { name: 'Emergency Fund', progress: 80 },
            { name: 'Vacation Fund', progress: 45 },
          ],
        };
      }

      // Call the AI service
      const response = await chat(message, conversationHistory, financialContext);

      res.json(response);
    } catch (error) {
      logger.error({ err: error }, 'AI Assistant chat error');
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  /**
   * GET /api/assistant/insights
   * Get quick AI insights for the dashboard
   */
  app.get("/api/assistant/insights", authenticate, async (req, res) => {
    try {
      const { getQuickInsights } = await import('./services/aiService.js');
      
      // Use demo context for quick insights
      const context = {
        savingsRate: 28,
        monthlyExpenses: 3845,
        netWorth: 142350,
        monthlyIncome: 7500,
        topSpendingCategories: [
          { name: 'Housing', amount: 1500 },
          { name: 'Food & Dining', amount: 680 },
        ],
      };

      const insights = getQuickInsights(context);
      res.json({ insights });
    } catch (error) {
      logger.error({ err: error }, 'AI insights error');
      res.status(500).json({ error: 'Failed to get insights' });
    }
  });

  /**
   * GET /api/assistant/insights/demo
   * Get quick AI insights (no auth required)
   */
  app.get("/api/assistant/insights/demo", async (_req, res) => {
    const insights = [
      "Muy bien: tu tasa de ahorro del 28% supera el 20% recomendado.",
      "Tu mayor gasto es Comida y restaurantes: $680/mes. ¿Podrías reducirlo?",
      "Recortar un 10% en gastos te ahorraría $385/mes o $4.620/año.",
    ];
    res.json({ insights });
  });

  // Accounts (Open Banking) routes
  app.get("/api/accounts", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const accts = await storage.getAccounts(userId);

      const body = JSON.stringify(accts);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({ 'Cache-Control': 'private, max-age=30, must-revalidate', 'ETag': etag });
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) return res.status(304).end();

      res.json(accts);
    } catch (_e) {
      logger.error({ err: _e }, 'Error fetching accounts');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/accounts", authenticate, validateBody(createAccountSchema), async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const payload = {
        ...req.body,
        userId,
      };
      // insertAccountSchema is now imported statically
      const accountData = insertAccountSchema.parse(payload);
      const account = await storage.createAccount(accountData);
      res.status(201).json(account);
    } catch (err) {
      if (err instanceof ZodError) {
        const validationError = fromZodError(err);
        return res.status(400).json({ message: 'Validation error', errors: validationError.details });
      }
      logger.error({ err }, 'Error creating account');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // All transactions across accounts (unified movements view)
  app.get("/api/transactions", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const userAccounts = await storage.getAccounts(userId);
      if (!userAccounts?.length) {
        return res.json([]);
      }
      const { from, to, limit } = req.query;
      const toDate = to ? new Date(String(to)) : new Date();
      const fromDate = from ? new Date(String(from)) : (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d; })();
      const cap = limit ? Math.min(parseInt(String(limit)), 500) : 200;
      const allTxns: { accountId: number; accountName?: string; accountType?: string; id: number; postedAt: string; description?: string | null; amount: number; currency?: string | null; category?: string | null }[] = [];
      for (const acc of userAccounts) {
        const txs = await storage.getTransactions(acc.id, { from: fromDate, to: toDate, limit: cap });
        for (const t of txs) {
          allTxns.push({
            accountId: acc.id,
            accountName: acc.name || acc.officialName || undefined,
            accountType: acc.type || undefined,
            id: t.id,
            postedAt: t.postedAt,
            description: t.description,
            amount: Number(t.amount),
            currency: t.currency,
            category: t.category,
          });
        }
      }
      allTxns.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      res.json(allTxns.slice(0, cap));
    } catch (_e) {
      logger.error({ err: _e }, 'Error fetching all transactions');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Transactions routes
  app.get("/api/accounts/:id/transactions", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const accountId = Number(req.params.id);
      const account = await storage.getAccount(accountId);
      if (!account || String(account.userId) !== userId) {
        return res.status(404).json({ message: 'Account not found' });
      }

      const { from, to, limit, offset } = req.query;
      const options = {
        from: from ? new Date(String(from)) : undefined,
        to: to ? new Date(String(to)) : undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined,
      };

      const txs = await storage.getTransactions(accountId, options);
      const body = JSON.stringify(txs);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({ 'Cache-Control': 'private, max-age=10, must-revalidate', 'ETag': etag });
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) return res.status(304).end();

      res.json(txs);
    } catch (_e) {
      logger.error({ err: _e }, 'Error fetching transactions');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/transactions/batch", authenticate, validateBody(batchTransactionsSchema), async (req, res) => {
    try {
      // Expect body: { accountId, transactions: InsertTransaction[] }
      const userId = getUserIdFromAuth(req);
      const { transactions } = req.body;
      if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        return res.status(400).json({ message: 'transactions[] are required' });
      }
      const accountId = Number(transactions[0].accountId);
      const account = await storage.getAccount(accountId);
      if (!account || String(account.userId) !== userId) {
        return res.status(404).json({ message: 'Account not found' });
      }

      // Coerce postedAt to Date
      const normalized = transactions.map((t: any) => ({
        ...t,
        accountId: Number(accountId),
        postedAt: typeof t.postedAt === 'string' ? new Date(t.postedAt) : t.postedAt,
      }));

      const created = await storage.createTransactionsBulk(normalized);
      res.status(201).json({ count: created.length });
    } catch (_e) {
      logger.error({ err: _e }, 'Error creating transactions batch');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Bank connection routes
  app.get("/api/bank-connections", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req); // userId is string
      const connections = await storage.getBankConnections(userId);
      
      // Set appropriate caching headers with a stable ETag based on content
      const body = JSON.stringify(connections);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({
        'Cache-Control': 'private, max-age=30, must-revalidate',
        'ETag': etag,
      });

      // Handle conditional request
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }
      
      res.json(connections);
    } catch (error) {
      logger.error({ err: error }, 'Error in bank connections');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/bank-connections", authenticate, validateBody(createBankConnectionSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const connectionData = insertBankConnectionSchema.parse({
      ...req.body,
      userId
    });
    const connection = await storage.createBankConnection(connectionData);
    res.status(201).json(connection);
  });

  app.put("/api/bank-connections/:id", authenticate, validateParams(idParamSchema), validateBody(updateBankConnectionSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const connectionId = Number(req.params.id);
    const connection = await storage.getBankConnection(connectionId);
    if (!connection || String(connection.userId) !== userId) {
      return res.status(404).json({ message: "Bank connection not found" });
    }
    const updatedConnection = await storage.updateBankConnection(
      connectionId, 
      req.body
    );
    res.json(updatedConnection);
  });

  app.delete("/api/bank-connections/:id", authenticate, validateParams(idParamSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const connectionId = Number(req.params.id);
    const connection = await storage.getBankConnection(connectionId);
    if (!connection || String(connection.userId) !== userId) {
      return res.status(404).json({ message: "Bank connection not found" });
    }
    await storage.deleteBankConnection(connectionId);
    res.json({ message: "Bank connection deleted" });
  });

  // Financial goals routes
  app.get("/api/financial-goals", authenticate, async (req, res) => {
    const userId = getUserIdFromAuth(req); // userId is string
    const goals = await storage.getFinancialGoals(userId);

    const body = JSON.stringify(goals);
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    res.set({
      'Cache-Control': 'private, max-age=30, must-revalidate',
      'ETag': etag,
    });
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.json(goals);
  });

  app.post("/api/financial-goals", authenticate, validateBody(createFinancialGoalSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    
    // Ensure user exists in database (create if needed for foreign key constraint)
    let user = await storage.getUser(userId);
    if (!user) {
      const userEmail = String((req as AuthenticatedRequest).user?.email || `${userId}@unknown.com`);
      const userName = String((req as AuthenticatedRequest).user?.name || userId);
      const [firstName, ...lastNameParts] = userName.split(' ');
      
      user = await storage.createUser({
        id: userId,
        username: userName,
        email: userEmail,
        passwordHash: "jwt-auth",
        firstName: firstName || 'User',
        lastName: lastNameParts.length > 0 ? lastNameParts.join(' ') : null
      });
      logger.info({ userId, email: userEmail }, 'Created new user for goal');
    }
    
    const goalData = insertFinancialGoalSchema.parse({
      ...req.body,
      userId,
      targetDate: typeof req.body.targetDate === 'string' 
        ? req.body.targetDate 
        : new Date(req.body.targetDate).toISOString() // Keep as ISO string for SQLite
    });
    const goal = await storage.createFinancialGoal(goalData);
    // Emit a creation notification (non-blocking)
    try {
      await notificationService.notifyGoalCreated(userId, goal.name, goal.id as number);
    } catch (notificationError) {
      logger.error({ err: notificationError }, 'Error creating goal notification');
    }
    res.status(201).json(goal);
  });

  app.put("/api/financial-goals/:id", authenticate, validateParams(idParamSchema), validateBody(updateFinancialGoalSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const goalId = Number(req.params.id);
    const goal = await storage.getFinancialGoal(goalId);
    if (!goal || String(goal.userId) !== userId) {
      return res.status(404).json({ message: "Financial goal not found" });
    }
    const updateData = req.body.targetDate ? {
      ...req.body,
      targetDate: typeof req.body.targetDate === 'string' 
        ? req.body.targetDate 
        : new Date(req.body.targetDate).toISOString() // Keep as ISO string for SQLite
    } : req.body;
    const updatedGoal = await storage.updateFinancialGoal(goalId, updateData);
    
    // Check for goal milestone notifications
    if (updatedGoal && req.body.currentAmount !== undefined) {
      try {
        const progress = Math.round((updatedGoal.currentAmount / updatedGoal.targetAmount) * 100);
        
        // Notify on significant milestones (25%, 50%, 75%, 90%, 100%)
        const milestones = [25, 50, 75, 90, 100];
        const currentMilestone = milestones.find(m => 
          progress >= m && 
          (goal.currentAmount / goal.targetAmount * 100) < m
        );
        
        if (currentMilestone) {
          await notificationService.notifyGoalMilestone(
            userId,
            updatedGoal.name,
            currentMilestone,
            updatedGoal.id as number
          );
        }
      } catch (notificationError) {
        logger.error({ err: notificationError }, 'Error creating goal milestone notification');
      }
    }
    
    res.json(updatedGoal);
  });

  app.delete("/api/financial-goals/:id", authenticate, validateParams(idParamSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const goalId = Number(req.params.id);
    const goal = await storage.getFinancialGoal(goalId);
    if (!goal || String(goal.userId) !== userId) {
      return res.status(404).json({ message: "Financial goal not found" });
    }
    await storage.deleteFinancialGoal(goalId);
    res.json({ message: "Financial goal deleted" });
  });

  // Notification routes
  app.get("/api/notifications", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { category, unreadOnly, limit, offset } = req.query;
      
      const options = {
        category: category as string | undefined,
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      };
      
      const notifications = await notificationService.getNotifications(userId, options);
      // Return fresh JSON always to avoid client-side 304 handling issues with fetch
      res.set({ 'Cache-Control': 'private, max-age=0, no-cache' });
      res.json(notifications);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching notifications');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const notificationId = Number(req.params.id);
      
      const success = await notificationService.markAsRead(notificationId, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      logger.error({ err: error }, 'Error marking notification as read');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put("/api/notifications/read-all", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      const success = await notificationService.markAllAsRead(userId);
      
      res.json({ 
        message: success ? "All notifications marked as read" : "No unread notifications found"
      });
    } catch (error) {
      logger.error({ err: error }, 'Error marking all notifications as read');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete("/api/notifications/:id", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const notificationId = Number(req.params.id);

      const success = await notificationService.deleteNotification(notificationId, userId);

      // Be idempotent: return 200 even if already deleted or not found for this user.
      // This prevents stale UI state from causing visible errors.
      if (!success) {
        return res.json({ message: "Notification deleted (or already removed)" });
      }

      res.json({ message: "Notification deleted" });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting notification');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get("/api/notifications/unread-count", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const count = await notificationService.getUnreadCount(userId);
      
      res.json({ count });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching unread count');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- Public/demo routes (no auth required) ---

  // ==========================================================================
  // SEED DATA ENDPOINT - Populate database with test data
  // ==========================================================================
  
  /**
   * POST /api/seed
   * Populates the database with comprehensive test data for the demo user
   */
  app.post("/api/seed", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      logger.info({ userId }, 'Seeding database with test data');

      // Clear existing data for this user (optional, based on query param)
      const clearExisting = req.query.clear === 'true';

      // 1. Create Financial Goals
      const goalsData = [
        { name: 'Emergency Fund', targetAmount: 15000, currentAmount: 12000, targetDate: new Date('2026-06-01'), category: 'savings' },
        { name: 'Vacation to Europe', targetAmount: 5000, currentAmount: 2250, targetDate: new Date('2026-08-15'), category: 'travel' },
        { name: 'New Car Down Payment', targetAmount: 10000, currentAmount: 3500, targetDate: new Date('2027-01-01'), category: 'purchase' },
        { name: 'Investment Portfolio', targetAmount: 50000, currentAmount: 28000, targetDate: new Date('2028-12-31'), category: 'investment' },
      ];

      const createdGoals = [];
      for (const goal of goalsData) {
        const created = await storage.createFinancialGoal({ ...goal, userId });
        createdGoals.push(created);
      }

      // 2. Create Expenses
      const expensesData = [
        { description: 'Grocery Shopping', amount: 156.78, category: 'Groceries', merchantName: 'Whole Foods', date: new Date('2026-01-25') },
        { description: 'Monthly Gym Membership', amount: 49.99, category: 'Healthcare', merchantName: 'Planet Fitness', date: new Date('2026-01-20'), isRecurring: true },
        { description: 'Dinner with Friends', amount: 85.50, category: 'Dining', merchantName: 'The Italian Place', date: new Date('2026-01-22') },
        { description: 'Gas Station', amount: 45.00, category: 'Transportation', merchantName: 'Shell', date: new Date('2026-01-24') },
        { description: 'Netflix Subscription', amount: 15.99, category: 'Entertainment', merchantName: 'Netflix', date: new Date('2026-01-15'), isRecurring: true },
        { description: 'Electric Bill', amount: 125.00, category: 'Utilities', merchantName: 'City Power', date: new Date('2026-01-10'), isRecurring: true },
        { description: 'New Headphones', amount: 199.99, category: 'Shopping', merchantName: 'Best Buy', date: new Date('2026-01-18') },
        { description: 'Coffee Shop', amount: 6.50, category: 'Dining', merchantName: 'Starbucks', date: new Date('2026-01-27') },
        { description: 'Uber Ride', amount: 24.50, category: 'Transportation', merchantName: 'Uber', date: new Date('2026-01-26') },
        { description: 'Online Course', amount: 99.00, category: 'Education', merchantName: 'Udemy', date: new Date('2026-01-12') },
      ];

      const createdExpenses = [];
      for (const expense of expensesData) {
        const created = await storage.createExpense({ ...expense, userId, isAutoClassified: true });
        createdExpenses.push(created);
      }

      // 3. Create Financial Products (if not exists)
      const productsData = [
        { name: 'Chase Sapphire Preferred', category: 'credit-cards', interestRate: '21.49', description: 'Premium travel rewards card with 2x points on travel and dining', features: ['60,000 bonus points', 'No foreign transaction fees', '$50 annual hotel credit'] },
        { name: 'Discover it Cash Back', category: 'credit-cards', interestRate: '18.24', description: 'Rotating 5% cash back categories', features: ['5% cash back categories', 'Cash back match first year', 'No annual fee'] },
        { name: 'Marcus Personal Loan', category: 'loans', interestRate: '7.49', description: 'No-fee personal loans for debt consolidation', features: ['No fees', 'Flexible terms', 'On-time payment reward'] },
        { name: 'SoFi Student Loan Refi', category: 'loans', interestRate: '4.99', description: 'Refinance student loans at competitive rates', features: ['No fees', 'Unemployment protection', 'Career coaching'] },
        { name: 'Ally High Yield Savings', category: 'savings', interestRate: '4.25', description: 'Online savings account with competitive APY', features: ['No minimum balance', 'No monthly fees', 'FDIC insured'] },
        { name: 'Wealthfront Cash Account', category: 'savings', interestRate: '5.00', description: 'High-yield cash account with FDIC insurance', features: ['5.00% APY', 'FDIC insured up to $8M', 'No fees'] },
        { name: 'Progressive Auto Insurance', category: 'insurance', interestRate: '0', description: 'Comprehensive auto coverage with discounts', features: ['Name Your Price tool', 'Snapshot discount', '24/7 claims'] },
        { name: 'Lemonade Renters Insurance', category: 'insurance', interestRate: '0', description: 'AI-powered renters insurance', features: ['Instant coverage', 'Claims in 3 minutes', 'Giveback program'] },
      ];

      const createdProducts = [];
      for (const product of productsData) {
        try {
          const created = await storage.createFinancialProduct(product);
          createdProducts.push(created);
        } catch (e) {
          // Product might already exist
        }
      }

      // 4. Create a Credit Score entry
      try {
        await storage.createCreditScore({
          userId,
          score: 742,
          provider: 'CODA',
          factors: JSON.stringify([
            { factor: 'Payment History', status: 'Excellent', impact: 'positive' },
            { factor: 'Credit Utilization', status: '23%', impact: 'positive' },
            { factor: 'Credit Age', status: '4.2 years', impact: 'neutral' },
            { factor: 'Credit Mix', status: 'Good', impact: 'positive' },
            { factor: 'Recent Inquiries', status: '2', impact: 'neutral' },
          ]),
        });
      } catch (e) {
        // Update if exists
        await storage.updateCreditScore(userId, { score: 742 });
      }

      // 5. Create Insurance Risk entry
      try {
        await storage.createInsuranceRisk({
          userId,
          overallRisk: 'Low',
          healthRisk: 'Low',
          autoRisk: 'Low',
          propertyRisk: 'Medium',
          factors: JSON.stringify([
            { category: 'Health', factor: 'Non-smoker', impact: 'positive' },
            { category: 'Auto', factor: 'Clean driving record', impact: 'positive' },
            { category: 'Property', factor: 'Urban area', impact: 'neutral' },
          ]),
        });
      } catch (e) {
        // Update if exists
        await storage.updateInsuranceRisk(userId, { overallRisk: 'Low' });
      }

      res.json({
        success: true,
        message: 'Database seeded successfully',
        created: {
          goals: createdGoals.length,
          expenses: createdExpenses.length,
          products: createdProducts.length,
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Error seeding database');
      res.status(500).json({ error: 'Failed to seed database' });
    }
  });

  // Document upload (PDF): Informe CMF y Cartolas → scoring real
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype !== "application/pdf") {
        return cb(new Error("Solo se aceptan archivos PDF (Informe CMF o Cartola bancaria)."));
      }
      cb(null, true);
    },
  });
  app.post(
    "/api/documents/upload",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      documentUpload.single("document")(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof Error && err.message.includes("PDF")) {
            return res.status(400).json({ message: err.message });
          }
          return res.status(400).json({ message: "Error al subir el archivo. Solo PDF permitido." });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) {
          return res.status(404).json({
            message: "Usuario no encontrado. Inicia sesión de nuevo o regístrate.",
          });
        }
        const file = (req as { file?: { buffer: Buffer } }).file;
        if (!file?.buffer) {
          return res.status(400).json({ message: "No se recibió ningún archivo. Usa el campo 'document'." });
        }
        const { processDocumentUpload } = await import("./services/documents/index.js");
        const result = await processDocumentUpload(userId, file.buffer);
        if (result.error) {
          return res.status(400).json({ message: result.error, step: result.step });
        }
        res.json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error procesando documento";
        if (msg.includes("password") || msg.includes("encrypted") || msg.includes("protected")) {
          return res.status(400).json({
            message: "El PDF está protegido o encriptado. Usa un documento sin contraseña.",
          });
        }
        logger.error({ err: e }, "Document upload failed");
        res.status(500).json({ message: "Error al procesar el documento. Intenta de nuevo." });
      }
    }
  );

  app.get("/api/transactional-score", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      const data = await storage.getTransactionalScore(userId);
      if (!data) {
        return res.json({ transactionalScore: null, mainInsights: [], metrics: undefined, recommendedProducts: [] });
      }
      res.json({
        transactionalScore: data.transactionalScore,
        mainInsights: data.mainInsights ?? [],
        metrics: data.metrics,
        recommendedProducts: data.recommendedProducts ?? [],
        lastUpdated: data.lastUpdated,
      });
    } catch (e) {
      logger.error({ err: e }, "Get transactional score failed");
      res.status(500).json({ message: "Error al obtener el score transaccional." });
    }
  });

  // Demo ingestion: usa el userId del JWT para que cada usuario vea solo sus datos
  app.post("/api/demo/ingest", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({
          message: "Usuario no encontrado. Inicia sesión de nuevo o regístrate para usar la carga demo.",
        });
      }
      const { ingestOpenBankingForUser } = await import("./jobs/ingest.js");
      await ingestOpenBankingForUser(userId);
      res.json({ message: "Demo ingestion completed" });
    } catch (_e) {
      logger.error({ err: _e }, 'Error running demo ingestion');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get("/api/demo/accounts", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = await ensureUserForToken(authReq.user!);
    if (!userId) {
      return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
    }
    const accts = await storage.getAccounts(userId);
    res.json(accts);
  });

  app.get("/api/demo/accounts/:id/transactions", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = await ensureUserForToken(authReq.user!);
    if (!userId) {
      return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
    }
    const accountId = Number(req.params.id);
    const account = await storage.getAccount(accountId);
    if (!account || String(account.userId) !== userId) {
      return res.status(404).json({ message: "Account not found" });
    }
    const { from, to, limit, offset } = req.query;
    const options = {
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      limit: limit ? parseInt(String(limit)) : 20,
      offset: offset ? parseInt(String(offset)) : 0,
    };
    const txs = await storage.getTransactions(accountId, options);
    res.json(txs);
  });

  // Credit score: datos reales del Informe CMF cuando el usuario está autenticado
  app.get("/api/credit-score", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    let userId: string | null = null;
    try {
      userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        logger.warn({ path: "/api/credit-score" }, "Credit score: usuario no encontrado para token");
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      const userIdStr = String(userId);
      logger.info({ userId: userIdStr, userIdType: typeof userId, path: "/api/credit-score" }, "Credit score: consultando storage (SELECT WHERE user_id = ...)");
      const existing = await storage.getCreditScore(userIdStr);
      if (!existing) {
        logger.info({ userId, path: "/api/credit-score" }, "Credit score: sin registro para userId, devolviendo score null");
        return res.json({
          score: null,
          maxScore: 850,
          paymentHistory: "",
          utilization: "",
          ageOfCredit: "",
        });
      }
      logger.info({ userId, score: existing.score, path: "/api/credit-score" }, "Credit score: registro encontrado");
      res.json({
        score: existing.score,
        maxScore: existing.maxScore ?? 850,
        paymentHistory: existing.paymentHistory ?? "Unknown",
        utilization: existing.utilization ?? "Unknown",
        ageOfCredit: existing.ageOfCredit ?? "Unknown",
      });
    } catch (e) {
      logger.error({ err: e, userId, path: "/api/credit-score" }, "Get credit score failed (posible error SQL o columna)");
      res.status(500).json({ message: "Error al obtener el score crediticio." });
    }
  });

  // Insurance risk routes (demo) — now derived from feature vector + PD
  app.get("/api/insurance-risk", async (_req, res) => {
    try {
      const userId = "demo-user";
      const { buildUserFeatureVector } = await import("./ml/features.js");
      const { scorePD } = await import("./services/pdScoring.js");
      const { computeInsuranceRiskFromFeatures } = await import("./utils/insuranceRisk.js");

      // Ensure demo user exists (some consumers read user fields)
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.createUser({
          id: userId,
          username: "demo",
          email: "demo@example.com",
          passwordHash: "demo-hash",
          firstName: "Demo",
          lastName: "User"
        });
      }

      const fv = await buildUserFeatureVector(userId, 90);
      const { pd } = scorePD(fv);
      const nextRisk = computeInsuranceRiskFromFeatures(fv, pd);

      const existing = await storage.getInsuranceRisk(userId);
      let saved;
      if (existing) {
        saved = await storage.updateInsuranceRisk(userId, nextRisk);
      } else {
        saved = await storage.createInsuranceRisk({ userId, ...nextRisk });
      }
      res.json(saved ?? nextRisk);
    } catch (_e) {
      logger.error({ err: _e }, 'Error computing insurance risk');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // PD Scoring (protected) - Expensive operation
  app.post("/api/scoring/application", authenticate, expensiveLimiter, validateBody(scoringApplicationSchema), async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { windowDays, model: bodyModel } = req.body || {};
      const modelParam = String(bodyModel || req.query.model || "baseline").toLowerCase();
      const { buildUserFeatureVector } = await import("./ml/features.js");
      const fv = await buildUserFeatureVector(userId, windowDays || 90);

      if (modelParam === "xgb") {
        try {
          const { PDModelRegistry } = await import("./services/modelRegistry.js");
          const reg = PDModelRegistry.instance();
          if (!reg.isReady) {
            await new Promise((r) => setTimeout(r, 150));
          }
          if (reg.isReady) {
            const pd = await reg.scoreXGB(fv as any);
            const reasons = ["model:xgb", ...reg.getTopFeatures(5)];
            return res.json({ pd, reasons, features: fv, model: reg.getManifest() });
          }

          // Fallback: one-off ONNX scoring if registry not yet ready
          const pathMod = await import("node:path");
          const fsMod = await import("node:fs");
          const baseDir = await getMLArtifactsDir();
          const manifest = JSON.parse(fsMod.readFileSync(pathMod.join(baseDir, "manifest.json"), "utf-8"));
          const featureMeta = JSON.parse(
            fsMod.readFileSync(pathMod.join(baseDir, manifest.feature_meta_path || "feature_meta.json"), "utf-8")
          );
          const onnxPath = pathMod.join(baseDir, manifest.onnx_path || "xgb_pd.onnx");
          const ortMod: any = await import("onnxruntime-node");
          const ortAny: any = (ortMod as any)?.default ?? ortMod;
          const feats = featureMeta.features.map((k: string) => Number((fv as any)[k] ?? 0));
          const input = new Float32Array(feats);
          const tensor = new ortAny.Tensor("float32", input, [1, feats.length]);
          const session = await ortAny.InferenceSession.create(onnxPath, { executionProviders: ["cpu"] });
          const outputs = await session.run({ input: tensor });
          const out = (outputs as any)[Object.keys(outputs)[0]];
          let p = Number(Array.isArray(out.data) ? out.data[0] : out.data[0]);
          const cal = manifest?.calibration;
          if (cal?.type === "platt" && typeof cal.params?.a === "number" && typeof cal.params?.b === "number") {
            const z = cal.params.a * p + cal.params.b;
            p = 1 / (1 + Math.exp(-z));
          }
          const reasons = ["model:xgb", ...((manifest?.shap_top || []) as string[]).slice(0, 5)];
          return res.json({ pd: p, reasons, features: fv, model: manifest });
        } catch (err) {
          logger.warn({ err }, 'XGB scoring failed, falling back to baseline');
        }
      }

      // Baseline
      const { scorePD } = await import("./services/pdScoring.js");
      const scored = scorePD(fv);
      res.json({ pd: scored.pd, reasons: scored.reasons, features: fv });
    } catch (_e) {
      logger.error({ err: _e }, 'Error scoring PD');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Demo PD for demo-user
  app.get("/api/demo/pd", async (req, res) => {
    try {
      const { buildUserFeatureVector } = await import("./ml/features.js");
      const { scorePD } = await import("./services/pdScoring.js");
      const fv = await buildUserFeatureVector("demo-user", 90);
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const modelParam = String(req.query.model || "baseline");
      if (modelParam.toLowerCase() === "xgb") {
        try {
          const reg = PDModelRegistry.instance();
          // Allow a short warm-up window for lazy model load
          if (!reg.isReady) {
            await new Promise((r) => setTimeout(r, 150));
          }
          if (reg.isReady) {
            const pd = await reg.scoreXGB(fv as any);
            const reasons = ["model:xgb", ...reg.getTopFeatures(5)];
            return res.json({ pd, reasons, features: fv, model: reg.getManifest() });
          }

          // Fallback: score directly via ONNXRuntime (one-off session) if registry not ready
          const pathMod = await import("node:path");
          const fsMod = await import("node:fs");
          const baseDir = await getMLArtifactsDir();
          const manifest = JSON.parse(fsMod.readFileSync(pathMod.join(baseDir, "manifest.json"), "utf-8"));
          const featureMeta = JSON.parse(
            fsMod.readFileSync(pathMod.join(baseDir, manifest.feature_meta_path || "feature_meta.json"), "utf-8")
          );
          const onnxPath = pathMod.join(baseDir, manifest.onnx_path || "xgb_pd.onnx");
          const ortMod: any = await import("onnxruntime-node");
          const ortAny: any = (ortMod as any)?.default ?? ortMod;
          const feats = featureMeta.features.map((k: string) => Number((fv as any)[k] ?? 0));
          const input = new Float32Array(feats);
          const tensor = new ortAny.Tensor("float32", input, [1, feats.length]);
          const session = await ortAny.InferenceSession.create(onnxPath, { executionProviders: ["cpu"] });
          const outputs = await session.run({ input: tensor });
          const out = (outputs as any)[Object.keys(outputs)[0]];
          let p = Number(Array.isArray(out.data) ? out.data[0] : out.data[0]);
          const cal = manifest?.calibration;
          if (cal?.type === "platt" && typeof cal.params?.a === "number" && typeof cal.params?.b === "number") {
            const z = cal.params.a * p + cal.params.b;
            p = 1 / (1 + Math.exp(-z));
          }
          const reasons = ["model:xgb", ...((manifest?.shap_top || []) as string[]).slice(0, 5)];
          return res.json({ pd: p, reasons, features: fv, model: manifest });
        } catch (err) {
          logger.warn({ err }, 'XGB scoring failed, falling back');
        }
      }
      const scored = scorePD(fv);
      res.json({ pd: scored.pd, reasons: scored.reasons, features: fv });
    } catch (_e) {
      logger.error({ err: _e }, 'Error scoring demo PD');
      // Return a safe fallback PD score so the frontend continues to work
      return res.json({ pd: 0.5, reasons: ['fallback'], features: { fallback: 1 } });
    }
  });

  // Demo features for demo-user
  app.get("/api/demo/features", async (_req, res) => {
    try {
      let fv: any = {};
      // If the DB schema isn't initialized (e.g. no `accounts` table), skip
      // expensive feature-building which queries the DB and instead use a
      // lightweight fallback vector.
      let canBuildFeatures = false;
      try {
        if (db) {
          // Try a harmless select to verify `accounts` table exists
          await db.select().from(accounts).limit(1);
          canBuildFeatures = true;
        }
      } catch (schemaErr) {
        canBuildFeatures = false;
      }

      if (canBuildFeatures) {
        try {
          const mod = await import("./ml/features.js");
          if (mod && typeof mod.buildUserFeatureVector === 'function') {
            fv = await mod.buildUserFeatureVector("demo-user", 90);
          } else {
            throw new Error('buildUserFeatureVector not available');
          }
        } catch (fvErr) {
          logger.warn({ err: fvErr }, 'Failed to build feature vector for demo user, using fallback');
          // Provide a minimal fallback feature vector so explanations can still be returned
          fv = { fallback: 1 };
        }
      } else {
        fv = { fallback: 1 };
      }
      res.json(fv);
    } catch (_e) {
      logger.error({ err: _e }, 'Error computing demo features');
      // Return a lightweight fallback vector instead of failing the request
      return res.json({ fallback: true, features: { fallback: 1 } });
    }
  });

  // Model info (if any trained model is present)
  app.get("/api/pd/model/info", async (_req, res) => {
    try {
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const reg = PDModelRegistry.instance();
      if (!reg.getManifest()) return res.status(204).end();
      res.json(reg.getManifest());
    } catch (_e) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Model status (readiness + top features if available)
  app.get("/api/pd/model/status", async (_req, res) => {
    try {
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const reg = PDModelRegistry.instance();
      const manifest = reg.getManifest();
      const isReady = reg.isReady;
      const topFeatures = reg.getTopFeatures(10);
      res.json({
        isReady,
        hasManifest: !!manifest,
        manifest,
        topFeatures,
      });
    } catch (_e) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Demo SHAP explanation (XGB) for demo-user
  app.get("/api/demo/pd/explain", async (req, res) => {
    try {
      const top = Math.max(1, Math.min(20, parseInt(String(req.query.top || '5'), 10)));
      let fv: any = {};
      // If the DB schema isn't initialized (e.g. no `accounts` table), skip
      // expensive feature-building which queries the DB and instead use a
      // lightweight fallback vector.
      let canBuildFeatures = false;
      try {
        if (db) {
          // Try a harmless select to verify `accounts` table exists
          await db.select().from(accounts).limit(1);
          canBuildFeatures = true;
        }
      } catch (schemaErr) {
        canBuildFeatures = false;
      }

      if (canBuildFeatures) {
        try {
          const mod = await import("./ml/features.js");
          if (mod && typeof mod.buildUserFeatureVector === 'function') {
            fv = await mod.buildUserFeatureVector("demo-user", 90);
          } else {
            throw new Error('buildUserFeatureVector not available');
          }
        } catch (fvErr) {
          logger.warn({ err: fvErr }, 'Failed to build feature vector for demo explain, using fallback');
          fv = { fallback: 1 };
        }
      } else {
        fv = { fallback: 1 };
      }

      // Prepare to call Python explainer
      const pathMod = await import("node:path");
      const fsMod = await import("node:fs");
      const cp = await import("node:child_process");

      const baseDir = await getMLArtifactsDir();
      // Derive ML root from artifacts dir (go up from artifacts/current to ml/)
      const mlRoot = pathMod.dirname(pathMod.dirname(baseDir));
      const script = pathMod.join(mlRoot, "shap_explain.py");
      const py = pathMod.join(mlRoot, ".venv", "bin", "python");

      if (!fsMod.existsSync(script)) {
        // SHAP explainer script not present on this host. Provide a lightweight
        // heuristic explanation so the frontend still receives useful data
        // instead of a 501. We rank features by absolute magnitude as a proxy
        // for importance when SHAP is unavailable.
        try {
          const featureKeys = Object.keys(fv || {});
          const ranked = featureKeys
            .map((k) => ({ feature: k, value: (fv as any)[k] }))
            .sort((a, b) => Math.abs((b.value || 0) as number) - Math.abs((a.value || 0) as number))
            .slice(0, top);
          return res.json({ features: fv, explanation: { method: 'heuristic', topFeatures: ranked } });
        } catch (e) {
          return res.json({ features: fv, explanation: { method: 'heuristic', topFeatures: [] } });
        }
      }

      const p = cp.spawn(py, [script, "--artifacts", baseDir, "--top", String(top)], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let out = "";
      let err = "";
      p.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      p.stderr.on("data", (d: Buffer) => { err += d.toString(); });
      p.on("error", () => {});

      p.stdin.write(JSON.stringify(fv));
      p.stdin.end();

      p.on("close", (code: number) => {
        if (code !== 0) {
          logger.warn({ stderr: err, stdout: out }, 'SHAP explainer failed, returning heuristic fallback');
          const featureKeys = Object.keys(fv || {});
          const ranked = featureKeys
            .map((k) => ({ feature: k, value: (fv as any)[k] }))
            .sort((a, b) => Math.abs((b.value || 0) as number) - Math.abs((a.value || 0) as number))
            .slice(0, top);
          return res.json({ features: fv, explanation: { method: 'heuristic', topFeatures: ranked } });
        }
        try {
          const parsed = JSON.parse(out);
          return res.json({ features: fv, explanation: parsed });
        } catch (_e) {
          logger.warn({ err: _e, stdout: out }, 'SHAP explainer parse error, returning heuristic fallback');
          const featureKeys = Object.keys(fv || {});
          const ranked = featureKeys
            .map((k) => ({ feature: k, value: (fv as any)[k] }))
            .sort((a, b) => Math.abs((b.value || 0) as number) - Math.abs((a.value || 0) as number))
            .slice(0, top);
          return res.json({ features: fv, explanation: { method: 'heuristic', topFeatures: ranked } });
        }
      });
    } catch (_e) {
      logger.error({ err: _e }, 'Error in demo SHAP explain');
      // Return a safe fallback so the frontend does not receive 501/500 errors
      return res.json({ features: { fallback: 1 }, explanation: { method: 'fallback', topFeatures: [] } });
    }
  });

  // Model refresh (protected): reloads artifacts/current
  app.post("/api/pd/model/refresh", authenticate, async (_req, res) => {
    try {
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const reg = PDModelRegistry.instance();
      await reg.reload();
      res.json({ ok: true, isReady: reg.isReady, manifest: reg.getManifest() });
    } catch (_e) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Expenses routes
  app.get("/api/expenses", authenticate, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenses = await storage.getExpenses(userId);

    const body = JSON.stringify(expenses);
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    res.set({
      'Cache-Control': 'private, max-age=30, must-revalidate',
      'ETag': etag,
    });
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.json(expenses);
  });

  app.post("/api/expenses", authenticate, validateBody(createExpenseSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    
    // Ensure user exists in database (create if needed for foreign key constraint)
    let user = await storage.getUser(userId);
    if (!user) {
      const userEmail = String((req as AuthenticatedRequest).user?.email || `${userId}@unknown.com`);
      const userName = String((req as AuthenticatedRequest).user?.name || userId);
      const [firstName, ...lastNameParts] = userName.split(' ');
      
      user = await storage.createUser({
        id: userId,
        username: userName,
        email: userEmail,
        passwordHash: "jwt-auth",
        firstName: firstName || 'User',
        lastName: lastNameParts.length > 0 ? lastNameParts.join(' ') : null
      });
      logger.info({ userId, email: userEmail }, 'Created new user for expense');
    }
    
    let expenseData = {
      ...req.body,
      userId,
      // Keep date as ISO string for SQLite
      date: typeof req.body.date === 'string' 
        ? req.body.date 
        : new Date(req.body.date).toISOString()
    };

    // Use AI classification if auto-classify is enabled
    if (req.body.isAutoClassified) {
      try {
        const { classifyExpenseWithAI } = await import("./utils/expenseClassifier.js");
        const classification = await classifyExpenseWithAI(
          req.body.description,
          req.body.merchantName,
          typeof req.body.amount === 'string' ? parseFloat(req.body.amount) : req.body.amount
        );
        
        // Override category and subcategory with AI suggestions if confidence is high enough
        if (classification.confidence >= 0.7) {
          expenseData = {
            ...expenseData,
            category: classification.category,
            subcategory: classification.subcategory || expenseData.subcategory,
            confidence: classification.confidence
          };
          logger.info({ 
            originalCategory: req.body.category, 
            aiCategory: classification.category, 
            confidence: classification.confidence 
          }, 'Applied AI classification to expense');
        }
      } catch (error) {
        logger.error({ err: error }, 'Failed to apply AI classification, using original category');
        // Continue with original data if AI classification fails
      }
    }

    const expense = await storage.createExpense(expenseData);
    
    // Check for unusual spending patterns and create notification
    try {
      logger.debug({ userId, amount: expense.amount, category: expense.category }, 'Processing expense notification');
      
      // For testing: create a notification for any expense >= $50
      const currentAmount = expense.amount;
      if (currentAmount >= 50) {
        logger.debug({ amount: currentAmount }, 'Creating expense notification');
        await notificationService.createNotification({
          userId,
          title: 'New Expense Added',
          message: `You added a $${currentAmount.toFixed(2)} expense for ${expense.category}.`,
          type: 'info',
          category: 'expense',
          actionUrl: '/expenses',
          metadata: JSON.stringify({ expenseId: expense.id, amount: currentAmount, category: expense.category })
        });
        logger.debug('Expense notification created');
      }
      
      // Original logic for unusual spending (keep this too)
      const userExpenses = await storage.getExpenses(userId);
      const categoryExpenses = userExpenses.filter(e => 
        e.category === expense.category && 
        e.id !== expense.id && // Exclude current expense
        new Date(e.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      );
      
      if (categoryExpenses.length > 0) {
        const averageAmount = categoryExpenses.reduce((sum, e) => sum + e.amount, 0) / categoryExpenses.length;
        
        // Notify if this expense is 2x more than average in this category
        if (currentAmount >= averageAmount * 2 && currentAmount >= 100) { // Also require minimum $100
          logger.debug({ currentAmount, averageAmount }, 'Creating unusual expense notification');
          await notificationService.notifyUnusualExpense(
            userId,
            currentAmount,
            expense.category,
            expense.id as number
          );
        }
      }
    } catch (notificationError) {
      logger.error({ err: notificationError }, 'Error creating expense notification');
    }
    
    res.status(201).json(expense);
  });

  app.put("/api/expenses/:id", authenticate, validateParams(idParamSchema), validateBody(updateExpenseSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenseId = Number(req.params.id);
    const expense = await storage.getExpense(expenseId);
    if (!expense || String(expense.userId) !== userId) {
      return res.status(404).json({ message: "Expense not found" });
    }
    const updateData = {
      ...req.body,
      // Keep date as ISO string for SQLite
      ...(req.body.date && { date: typeof req.body.date === 'string' ? req.body.date : new Date(req.body.date).toISOString() })
    };
    const updatedExpense = await storage.updateExpense(expenseId, updateData);
    res.json(updatedExpense);
  });

  app.delete("/api/expenses/:id", authenticate, validateParams(idParamSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenseId = Number(req.params.id);
    const expense = await storage.getExpense(expenseId);
    if (!expense || String(expense.userId) !== userId) {
      return res.status(404).json({ message: "Expense not found" });
    }
    await storage.deleteExpense(expenseId);
    res.json({ message: "Expense deleted" });
  });

  // AI Expense Classification endpoint
  app.post("/api/expenses/classify", authenticate, async (req, res) => {
    try {
      const { description, merchantName, amount } = req.body;
      
      if (!description) {
        return res.status(400).json({ message: "Description is required" });
      }

      const { classifyExpenseWithAI } = await import("./utils/expenseClassifier.js");
      const result = await classifyExpenseWithAI(
        description,
        merchantName,
        typeof amount === 'string' ? parseFloat(amount) : amount
      );

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Error classifying expense');
      res.status(500).json({ message: 'Failed to classify expense' });
    }
  });

  // Expense receipt/ticket scan (Vision): extract amount, merchant, category
  const expenseImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png"];
      if (!allowed.includes(file.mimetype)) {
        return cb(new Error("Solo se aceptan imágenes JPG o PNG."));
      }
      cb(null, true);
    },
  });
  app.post(
    "/api/expenses/scan",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      expenseImageUpload.single("image")(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : "Error al subir la imagen.";
          return res.status(400).json({ message: msg });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = (req as { file?: { buffer: Buffer; mimetype: string } }).file;
        if (!file?.buffer) {
          return res.status(400).json({ message: "No se recibió ninguna imagen. Usa el campo 'image'." });
        }
        const { scanExpenseFromImage } = await import("./services/expenseScanService.js");
        const result = await scanExpenseFromImage(file.buffer, file.mimetype);
        res.json(result);
      } catch (e) {
        logger.error({ err: e }, "Expense scan failed");
        res.status(500).json({
          message: e instanceof Error ? e.message : "Error al escanear la imagen.",
        });
      }
    }
  );

  /**
   * GET /api/expenses/monthly-summary
   * Aggregates expenses by current month (total + by category) and last 6 months (total per month).
   * Used by MonthlyTracker for real expense data.
   */
  app.get("/api/expenses/monthly-summary", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const allExpenses = await storage.getExpenses(userId);
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      const byMonth = new Map<string, number>();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const byCategoryThisMonth: Record<string, number> = {};
      let currentMonthTotal = 0;

      for (const e of allExpenses) {
        const dateStr = typeof e.date === "string" ? e.date : (e as any).date;
        const d = new Date(dateStr);
        if (isNaN(d.getTime()) || d < sixMonthsAgo) continue;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const amount = typeof e.amount === "number" ? e.amount : parseFloat(String(e.amount));
        if (isNaN(amount)) continue;
        const absAmount = Math.abs(amount);
        byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + absAmount);
        if (monthKey === currentMonthKey) {
          currentMonthTotal += absAmount;
          const cat = (e as any).category || "Otros";
          byCategoryThisMonth[cat] = (byCategoryThisMonth[cat] || 0) + absAmount;
        }
      }

      const last6Months: { month: string; year: number; monthLabel: string; spent: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const spent = byMonth.get(monthKey) || 0;
        last6Months.push({
          month: monthKey,
          year: d.getFullYear(),
          monthLabel: d.toLocaleDateString("en-US", { month: "short" }),
          spent: Math.round(spent * 100) / 100,
        });
      }

      res.json({
        currentMonth: {
          totalSpent: Math.round(currentMonthTotal * 100) / 100,
          byCategory: Object.entries(byCategoryThisMonth)
            .map(([category, spent]) => ({ category, spent: Math.round(spent * 100) / 100 }))
            .sort((a, b) => b.spent - a.spent),
        },
        last6Months,
      });
    } catch (err) {
      logger.error({ err }, "Error fetching expenses monthly summary");
      res.status(500).json({ message: "Failed to fetch monthly summary" });
    }
  });

  // =============================================
  // PUBLIC BILL SPLIT ROUTES (No authentication)
  // =============================================
  
  // Get bill split by share code (public - anyone with link can view)
  app.get("/api/share/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const billSplit = await storage.getBillSplitByShareCode(code);
      
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found or link expired" });
      }
      
      // Get participants
      const participants = await storage.getBillSplitParticipants(billSplit.id as number);
      
      // Get creator name
      const creator = await storage.getUser(billSplit.createdBy);
      const creatorName = creator ? 
        `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || creator.username : 
        'Unknown';
      
      // Calculate progress
      const paidCount = participants.filter(p => p.isPaid).length;
      const totalPaid = participants.reduce((sum, p) => sum + (p.isPaid ? parseFloat(String(p.amountOwed)) : 0), 0);
      
      res.json({
        id: billSplit.id,
        name: billSplit.name,
        description: billSplit.description,
        totalAmount: billSplit.totalAmount,
        date: billSplit.date,
        status: billSplit.status,
        createdByName: creatorName,
        shareCode: billSplit.shareCode,
        participants: participants.map(p => ({
          id: p.id,
          name: p.name,
          amountOwed: p.amountOwed,
          isPaid: p.isPaid,
          amountPaid: p.amountPaid
        })),
        progress: {
          paidCount,
          totalCount: participants.length,
          totalPaid,
          percentPaid: participants.length > 0 ? Math.round((paidCount / participants.length) * 100) : 0
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching shared bill split');
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // Pay your share (public - identify by name/email)
  app.post("/api/share/:code/pay", async (req, res) => {
    try {
      const { code } = req.params;
      const { participantId, name, email, paymentMethod } = req.body;
      
      const billSplit = await storage.getBillSplitByShareCode(code);
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      const participants = await storage.getBillSplitParticipants(billSplit.id as number);
      
      // Find participant by ID, name, or email
      let participant = participants.find(p => 
        (participantId && p.id === participantId) ||
        (name && p.name.toLowerCase() === name.toLowerCase()) ||
        (email && p.email && p.email.toLowerCase() === email.toLowerCase())
      );
      
      if (!participant) {
        return res.status(404).json({ 
          message: "Participant not found. Please check your name matches exactly.",
          availableNames: participants.filter(p => !p.isPaid).map(p => p.name)
        });
      }
      
      if (participant.isPaid) {
        return res.status(400).json({ message: "This participant has already paid" });
      }
      
      // Mark as paid
      const updatedParticipant = await storage.updateBillSplitParticipant(participant.id as number, {
        isPaid: true,
        amountPaid: participant.amountOwed
      });
      
      // Notify the bill creator
      try {
        await notificationService.notifyBillSplitPaymentReceived(
          billSplit.createdBy,
          participant.name,
          parseFloat(String(participant.amountOwed)),
          billSplit.name,
          billSplit.id as number
        );
      } catch (err) {
        logger.error({ err }, 'Error sending payment notification');
      }
      
      // Check if all participants have paid
      const updatedParticipants = await storage.getBillSplitParticipants(billSplit.id as number);
      const allPaid = updatedParticipants.every(p => p.isPaid);
      
      if (allPaid) {
        await storage.updateBillSplit(billSplit.id as number, { status: 'settled' });
      }
      
      res.json({ 
        message: `Payment confirmed! Thank you, ${participant.name}!`,
        participant: {
          id: updatedParticipant?.id,
          name: updatedParticipant?.name,
          amountPaid: updatedParticipant?.amountOwed,
          isPaid: true
        },
        allPaid,
        paymentMethod: paymentMethod || 'other'
      });
    } catch (error) {
      logger.error({ err: error }, 'Error processing payment');
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // Join a bill split (link participant to logged-in user's account)
  app.post("/api/share/:code/join", authenticate, async (req, res) => {
    try {
      const { code } = req.params;
      const { participantId } = req.body;
      const userId = getUserIdFromAuth(req);
      
      const billSplit = await storage.getBillSplitByShareCode(code);
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      const participants = await storage.getBillSplitParticipants(billSplit.id as number);
      
      // Find the participant
      const participant = participants.find(p => p.id === participantId);
      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      // Check if participant is already linked to a user
      if (participant.userId) {
        return res.status(400).json({ message: "This participant is already linked to an account" });
      }
      
      // Check if current user is already a participant in this split
      const existingParticipation = participants.find(p => p.userId === userId);
      if (existingParticipation) {
        return res.status(400).json({ message: "You are already a participant in this split" });
      }
      
      // Link the participant to the current user
      const updatedParticipant = await storage.updateBillSplitParticipant(participant.id as number, {
        userId: userId
      });
      
      // Get user info for notification
      const user = await storage.getUser(userId);
      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : 'Someone';
      
      // Notify the bill creator
      try {
        await storage.createNotification({
          userId: billSplit.createdBy,
          type: 'bill_split',
          category: 'bill_split',
          title: 'Someone joined your split',
          message: `${userName} joined "${billSplit.name}" as ${participant.name}`
        });
      } catch (err) {
        logger.error({ err }, 'Error sending join notification');
      }
      
      res.json({ 
        message: `You've been added as ${participant.name} to this split!`,
        participant: {
          id: updatedParticipant?.id,
          name: updatedParticipant?.name,
          amountOwed: updatedParticipant?.amountOwed,
          isPaid: updatedParticipant?.isPaid
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Error joining bill split');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Bill splits routes
  app.get("/api/bill-splits", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const userEmail = (req as AuthenticatedRequest).user?.email;
      
      const possibleEmail = userEmail;
      
      // Ensure user exists in database (create if needed)
      let user = await storage.getUser(userId);
      if (!user && possibleEmail) {
        // Extract user info from JWT token token
        const userName = String((req as AuthenticatedRequest).user?.name || (req as AuthenticatedRequest).user?.name || 'User');
        const [firstName, ...lastNameParts] = userName.split(' ');
        
        user = await storage.createUser({
          id: userId,
          username: String((req as AuthenticatedRequest).user?.name || userId),
          email: String(possibleEmail),
          passwordHash: "jwt-auth",
          firstName: firstName || 'User',
          lastName: lastNameParts.length > 0 ? lastNameParts.join(' ') : null
        });
      }
      
      // Link existing participant records to this user if they match by email
      if (possibleEmail) {
        const unlinkedParticipants = await storage.getUnlinkedParticipantsByEmail(String(possibleEmail));
        if (unlinkedParticipants && unlinkedParticipants.length > 0) {
          for (const participant of unlinkedParticipants) {
            await storage.updateBillSplitParticipant(participant.id, { userId: userId });
          }
        }
      }
      
      // Get bill splits where user is the creator
      const createdBillSplits = await storage.getBillSplits(userId);
      
      // Get bill splits where user is a participant
      const participantBillSplits = await storage.getBillSplitsAsParticipant(userId);
      
      // Combine and deduplicate (in case user is both creator and participant)
      const allBillSplits = [...createdBillSplits];
      for (const participantSplit of participantBillSplits) {
        if (!createdBillSplits.some(cs => cs.id === participantSplit.id)) {
          allBillSplits.push(participantSplit);
        }
      }
      
      // Fetch participants for each bill split and add user role info
      const billSplitsWithParticipants = await Promise.all(
        allBillSplits.map(async (billSplit) => {
          const participants = await storage.getBillSplitParticipants(billSplit.id as number);
          const isCreator = String(billSplit.createdBy) === userId;
          const isParticipant = participants.some(p => String(p.userId) === userId);
          
          // Mark which participant is the current user
          const participantsWithCurrentUser = participants.map(p => ({
            ...p,
            isCurrentUser: String(p.userId) === userId
          }));
          
          return {
            ...billSplit,
            participants: participantsWithCurrentUser,
            userRole: isCreator ? 'creator' : (isParticipant ? 'participant' : 'none')
          };
        })
      );
      
      res.json(billSplitsWithParticipants);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching bill splits');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/bill-splits", authenticate, validateBody(createBillSplitSchema), async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      // Ensure user exists in database (create if needed)
      let user = await storage.getUser(userId);
      if (!user) {
        // Extract user info from JWT token token
        const userEmail = String((req as AuthenticatedRequest).user?.email || `${userId}@unknown.com`);
        const userName = String((req as AuthenticatedRequest).user?.name || (req as AuthenticatedRequest).user?.name || 'User');
        const [firstName, ...lastNameParts] = userName.split(' ');
        
        user = await storage.createUser({
          id: userId,
          username: String((req as AuthenticatedRequest).user?.name || userId),
          email: userEmail,
          passwordHash: "jwt-auth",
          firstName: firstName || 'User',
          lastName: lastNameParts.length > 0 ? lastNameParts.join(' ') : null
        });
        logger.info({ userId, email: userEmail }, 'Created new user');
      }
      
      // Extract participants from request body (don't include in bill split data)
      const { participants, ...billSplitFields } = req.body;
      
      // Generate a unique share code for the bill split
      const shareCode = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
      
      const billSplitData = {
        ...billSplitFields,
        // Use canonical DB user id (returned from createUser) when available
        createdBy: (user && user.id) ? user.id : userId,
        // Ensure date is a proper Date object
        date: req.body.date ? new Date(req.body.date) : new Date(),
        // Add share code for sharing the bill split
        shareCode: shareCode
      };
      const billSplit = await storage.createBillSplit(billSplitData);
      
      // Create notification for bill split creation
      try {
        logger.debug({ userId, name: billSplit.name, amount: billSplit.totalAmount }, 'Creating bill split notification');
        await notificationService.notifyBillSplitCreated(
          userId, 
          billSplit.name || 'New Bill Split',
          billSplit.totalAmount,
          billSplit.id as number
        );
        logger.debug('Bill split notification created');
      } catch (notificationError) {
        logger.error({ err: notificationError }, 'Error creating bill split notification');
      }
      
      // Create participants if provided and send email invitations
      if (participants && Array.isArray(participants)) {
        const creatorName = user ? 
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username :
          (req as AuthenticatedRequest).user?.name || (req as AuthenticatedRequest).user?.name || 'Someone';
        
        for (const participant of participants) {
          let participantUserId = null;
          
          // Check if user exists by email
          if (participant.email) {
            const existingUser = await storage.getUserByEmail(participant.email);
            if (existingUser) {
              participantUserId = existingUser.id;
            }
          }
          
          const newParticipant = await storage.createBillSplitParticipant({
            billSplitId: billSplit.id as number,
            name: participant.name || 'Unknown',
            email: participant.email || null,
            userId: participantUserId || participant.userId || null,
            amountOwed: participant.amountOwed || (billSplit.totalAmount / participants.length).toFixed(2),
            isPaid: participant.isPaid || false,
            amountPaid: participant.isPaid ? (participant.amountOwed || 0) : 0
          });
          
          // Send email invitation if email is provided
          if (participant.email && newParticipant) {
            try {
              const emailResult = await emailService.sendBillSplitInvitation({
                billSplit: billSplit,
                participantName: participant.name,
                participantEmail: participant.email,
                amountOwed: newParticipant.amountOwed.toFixed(2),
                creatorName: String(creatorName)
              });
              
              const emailSent = !!emailResult;
              if (emailSent) {
                logger.info({ email: participant.email }, 'Email invitation sent');
              }
            } catch (emailError) {
              logger.error({ err: emailError }, 'Error sending email invitation');
            }
          }
        }
        
        // Check if all participants are already paid (auto-settle)
        const allParticipants = await storage.getBillSplitParticipants(billSplit.id as number);
        const allPaid = allParticipants.length > 0 && allParticipants.every(p => p.isPaid);
        if (allPaid) {
          await storage.updateBillSplit(billSplit.id as number, { status: 'settled' });
          billSplit.status = 'settled';
        }
      }

      // Return full shape (with participants and createdByName) so frontend can update Saldo immediately
      const participants = await storage.getBillSplitParticipants(billSplit.id as number);
      const creatorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : (req as AuthenticatedRequest).user?.name || 'Usuario';
      const isCreator = true;
      const payload = {
        ...billSplit,
        createdByName: creatorName,
        participants: participants.map(p => ({ ...p, isCurrentUser: String(p.userId) === userId })),
        userRole: 'creator',
      };
      res.status(201).json(payload);
    } catch (error) {
      logger.error({ err: error }, 'Error creating bill split');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put("/api/bill-splits/:id", authenticate, validateParams(idParamSchema), validateBody(updateBillSplitSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const billSplitId = Number(req.params.id);
    const billSplit = await storage.getBillSplit(billSplitId);
    if (!billSplit || String(billSplit.createdBy) !== userId) {
      return res.status(404).json({ message: "Bill split not found" });
    }
    const updateData = {
      ...req.body,
      // Convert date string to Date object if date is provided
      ...(req.body.date && { date: new Date(req.body.date) })
    };
    const updatedBillSplit = await storage.updateBillSplit(billSplitId, updateData);
    res.json(updatedBillSplit);
  });

  app.delete("/api/bill-splits/:id", authenticate, validateParams(idParamSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const billSplitId = Number(req.params.id);
    const billSplit = await storage.getBillSplit(billSplitId);
    if (!billSplit || String(billSplit.createdBy) !== userId) {
      return res.status(404).json({ message: "Bill split not found" });
    }
    await storage.deleteBillSplit(billSplitId);
    res.json({ message: "Bill split deleted" });
  });

  app.put("/api/bill-splits/:id/participants/:participantId", authenticate, validateBody(updateBillSplitParticipantSchema), async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const billSplitId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    const billSplit = await storage.getBillSplit(billSplitId);
    if (!billSplit || String(billSplit.createdBy) !== userId) {
      return res.status(404).json({ message: "Bill split not found" });
    }
    const updatedParticipant = await storage.updateBillSplitParticipant(participantId, req.body);
    res.json(updatedParticipant);
  });

  // Mark participant as paid
  app.post("/api/bill-splits/:id/participants/:participantId/pay", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const participantId = Number(req.params.participantId);
      
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      // Check if user is either the bill creator OR the participant being marked as paid
      const participants = await storage.getBillSplitParticipants(billSplitId);
      const targetParticipant = participants.find(p => p.id === participantId);
      
      if (!targetParticipant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      const isCreator = String(billSplit.createdBy) === userId;
      const isTargetParticipant = String(targetParticipant.userId) === userId;
      
      if (!isCreator && !isTargetParticipant) {
        return res.status(403).json({ message: "Not authorized to mark this participant as paid" });
      }
      
      const participant = await storage.updateBillSplitParticipant(participantId, {
        isPaid: true,
        amountPaid: req.body.amountPaid || req.body.amountOwed
      });
      
      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      // Notify bill creator about payment
      if (String(billSplit.createdBy) !== userId) { // Only notify if payer is not the creator
        try {
          const payerUser = await storage.getUser(userId);
          const payerName = payerUser ? 
            `${payerUser.firstName || ''} ${payerUser.lastName || ''}`.trim() || payerUser.username :
            'Someone';
          
          await notificationService.createNotification({
            userId: String(billSplit.createdBy),
            title: 'Payment Received',
            message: `${payerName} has paid their share for "${billSplit.name}".`,
            type: 'success',
            category: 'bill_split',
            actionUrl: '/bill-split',
            metadata: JSON.stringify({ billSplitId, participantId, paidAmount: participant.amountPaid })
          });
        } catch (notificationError) {
          logger.error({ err: notificationError }, 'Error creating payment notification');
        }
      }
      
      // After marking payment, check if all participants are now paid and mark the
      // bill split as settled if so. Also return updated bill split info so the
      // frontend can refresh balances immediately.
      try {
        const participantsAfter = await storage.getBillSplitParticipants(billSplitId);
        const allPaidAfter = participantsAfter.length > 0 && participantsAfter.every((p) => !!p.isPaid);
        let updatedBillSplit = billSplit;
        if (allPaidAfter) {
          await storage.updateBillSplit(billSplitId, { status: 'settled' });
          updatedBillSplit = await storage.getBillSplit(billSplitId) || billSplit;
        }

        res.json({ message: "Payment marked successfully", participant, billSplit: updatedBillSplit });
      } catch (e) {
        // If anything goes wrong updating settlement status, still return success for payment
        logger.error({ err: e }, 'Error updating bill split settlement status');
        res.json({ message: "Payment marked successfully", participant });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error marking payment');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Archive/Complete a bill split
  app.post("/api/bill-splits/:id/archive", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      const updatedBillSplit = await storage.updateBillSplit(billSplitId, {
        status: "settled"
      });
      
      res.json({ message: "Bill split archived successfully", billSplit: updatedBillSplit });
    } catch (error) {
      logger.error({ err: error }, 'Error archiving bill split');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Debug endpoint to check what users exist
  // SECURITY: Only available when DEBUG_ENDPOINTS=true AND not in production
  // This endpoint should NEVER be enabled in production deployments
  if (process.env.DEBUG_ENDPOINTS === 'true' && process.env.NODE_ENV !== 'production') {
    app.get("/api/debug/users", async (req: Request, res: Response) => {
      try {
        // Get all users (limit to email and id for privacy)
        const users = [];
        const { MemStorage } = await import('./storage.js');
        
        if (storage instanceof MemStorage) {
          // In-memory storage
          for (const user of (storage as any).users.values()) {
            users.push({ id: user.id, email: user.email });
          }
        } else {
          // Database storage - would need a different approach
          return res.json({ message: "Database storage detected - cannot easily list users" });
        }
        
        res.json({ users, total: users.length });
      } catch (error) {
        logger.error({ err: error }, 'Error in debug users');
        res.status(500).json({ message: 'Internal server error' });
      }
    });
  }

  // Check if user exists for email invitation (no auth required)
  app.get("/api/bill-splits/:id/check-user/:email", async (req: Request, res: Response) => {
    try {
      const billSplitId = Number(req.params.id);
      const email = decodeURIComponent(req.params.email);
      
      // Always check if user exists by email first
      logger.debug({ email }, 'Checking if user exists');
      const user = await storage.getUserByEmail(email);
      const userExists = !!user;
      logger.debug({ userExists, userId: user?.id }, 'User existence check result');
      
      // Check if bill split exists
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit) {
        // Return user exists info even if bill split doesn't exist (for demo purposes)
        return res.status(404).json({ 
          message: "Bill split not found", 
          userExists,
          billSplitName: "Demo Bill Split",
          invitedEmail: email,
          billSplitId: billSplitId
        });
      }
      
      // Check if the email is actually invited to this bill split
      const participants = await storage.getBillSplitParticipants(billSplitId);
      const isInvited = participants.some(p => p.email && p.email.toLowerCase() === email.toLowerCase());
      
      if (!isInvited) {
        return res.status(403).json({ 
          message: "Email not invited to this bill split", 
          userExists,
          billSplitName: billSplit.name,
          invitedEmail: email,
          billSplitId: billSplitId
        });
      }
      
      res.json({ 
        userExists,
        billSplitName: billSplit.name,
        invitedEmail: email,
        billSplitId: billSplitId
      });
    } catch (error) {
      logger.error({ err: error }, 'Error checking user for invitation');
      res.status(500).json({ message: 'Internal server error', userExists: false });
    }
  });

  // Send invitations for a bill split
  app.post("/api/bill-splits/:id/invite", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const { participants } = req.body; // Array of { name, email } objects
      
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      // Get creator user info for email
      const creatorUser = await storage.getUser(userId);
      const creatorName = creatorUser ? 
        `${creatorUser.firstName || ''} ${creatorUser.lastName || ''}`.trim() || creatorUser.username :
        String((req as AuthenticatedRequest).user?.name || (req as AuthenticatedRequest).user?.name || 'Someone');
      
      const inviteResults = [];
      
      for (const participant of participants) {
        let participantUserId = null;
        let emailSent = false;
        
        // Check if user exists by email
        if (participant.email) {
          const existingUser = await storage.getUserByEmail(participant.email);
          if (existingUser) {
            participantUserId = existingUser.id;
          }
        }
        
        // Create participant record
        const newParticipant = await storage.createBillSplitParticipant({
          billSplitId: billSplitId,
          name: participant.name,
          email: participant.email || null,
          userId: participantUserId,
          amountOwed: participant.amount || (billSplit.totalAmount / participants.length).toFixed(2)
        });
        
        // Send email invitation if email is provided
        if (participant.email && newParticipant) {
          try {
            const emailResult = await emailService.sendBillSplitInvitation({
              billSplit: billSplit,
              participantName: participant.name,
              participantEmail: participant.email,
              amountOwed: newParticipant.amountOwed.toFixed(2),
              creatorName: String(creatorName)
            });
            
            emailSent = !!emailResult;
            logger.info({ email: participant.email, sent: emailSent }, 'Email invitation status');
          } catch (emailError) {
            logger.error({ err: emailError }, 'Error sending email invitation');
            emailSent = false;
          }
        }
        
        inviteResults.push({
          participant: newParticipant,
          userExists: !!participantUserId,
          inviteSent: emailSent
        });
      }
      
      const emailsSentCount = inviteResults.filter(r => r.inviteSent).length;
      const message = emailsSentCount > 0 ? 
        `Invitations sent! ${emailsSentCount} email(s) sent successfully.` :
        "Participants added to bill split.";
      
      res.json({ 
        message,
        results: inviteResults,
        emailsSent: emailsSentCount,
        totalInvites: inviteResults.length
      });
    } catch (error) {
      logger.error({ err: error }, 'Error processing invitations');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Profile routes - Auth operations should be rate limited
  app.get("/api/profile", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      // Try to get user from database first
      let user = await storage.getUser(userId);
      
      // If user doesn't exist in our database, create from JWT payload
      if (!user) {
        try {
          const authReq = req as AuthenticatedRequest;
          const newUser = await storage.createUser({
            id: userId,
            username: authReq.user?.email?.split('@')[0] || userId,
            email: authReq.user?.email || `${userId}@unknown.com`,
            passwordHash: "jwt-auth",
            firstName: authReq.user?.name || null,
            lastName: null,
            displayName: authReq.user?.name || null,
            profilePicture: null,
          });
          user = newUser;
        } catch (error) {
          logger.error({ err: error }, 'Error creating user from JWT data');
          const authReq = req as AuthenticatedRequest;
          // Fallback to JWT payload
          return res.json({
            id: userId,
            displayName: authReq.user?.name || "",
            email: authReq.user?.email || "",
            timezone: "UTC",
            language: "English"
          });
        }
      }
      
      // Return user profile data
      res.json({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        timezone: user.timezone || "UTC",
        language: user.language || "English",
        profilePicture: user.profilePicture,
        userMetadata: user.userMetadata,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    } catch (error) {
      logger.error({ err: error }, 'Profile get error');
      res.status(500).json({ message: 'Failed to get profile' });
    }
  });

  app.put("/api/profile", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { displayName, firstName, lastName, timezone, language, userMetadata } = req.body;
      
      // First check if user exists, if not create them
      let user = await storage.getUser(userId);
      
      if (!user) {
        // Create user from JWT payload if they don't exist
        try {
          user = await storage.createUser({
            id: userId,
            username: String((req as AuthenticatedRequest).user?.name || ((req as AuthenticatedRequest).user?.email as string)?.split('@')[0] || userId),
            email: (req as AuthenticatedRequest).user?.email as string || `${userId}@unknown.com`,
            passwordHash: "jwt-auth",
            firstName: (req as AuthenticatedRequest).user?.name as string || null,
            lastName: null,
            displayName: (req as AuthenticatedRequest).user?.name as string || null,
          });
        } catch (createError) {
          logger.error({ err: createError }, 'Error creating user');
          return res.status(500).json({ message: 'Failed to create user profile' });
        }
      }
      
      // Update user in database
      const updatedUser = await storage.updateUser(userId, {
        displayName,
        firstName,
        lastName,
        timezone,
        language,
        userMetadata
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'Failed to update user profile' });
      }
      
      res.json({
        id: updatedUser.id,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        timezone: updatedUser.timezone,
        language: updatedUser.language,
        profilePicture: updatedUser.profilePicture,
        userMetadata: updatedUser.userMetadata,
        updatedAt: updatedUser.updatedAt
      });
    } catch (error) {
      logger.error({ err: error }, 'Profile update error');
      res.status(500).json({ message: 'Failed to update profile' });
    }
  });

  // User management routes - Sensitive operations
  app.post("/api/profile/change-password", authenticate, authLimiter, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      // TODO: Implement password change for JWT auth
      res.json({ message: "Password change email sent successfully" });
    } catch (error) {
      logger.error({ err: error }, 'Password change error');
      res.status(500).json({ message: "Failed to send password change email" });
    }
  });

  app.delete("/api/profile/account", authenticate, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromAuth(req);
      logger.info({ userId }, 'Received request to delete account');

      // First, delete user data from our application's database
      await storage.deleteUserData(userId);
      logger.info({ userId }, 'Database cleanup complete');

      // Account deleted successfully from local database
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      // Let the central error handler deal with it
      next(error); 
    }
  });

  app.get("/api/profile/mfa-status", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      // MFA not implemented for JWT auth
      res.json({ enrolled: false, methods: [] });
    } catch (error) {
      logger.error({ err: error }, 'MFA status error');
      res.status(500).json({ message: "Failed to get MFA status" });
    }
  });

  app.post("/api/profile/enable-mfa", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      // MFA not implemented for JWT auth
      res.status(501).json({ message: "MFA not implemented for JWT authentication" });
    } catch (error) {
      logger.error({ err: error }, 'MFA enrollment error');
      res.status(500).json({ message: "Failed to enable MFA" });
    }
  });

  // Financial products routes (public)
  app.get("/api/financial-products", async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const products = await storage.getFinancialProducts(category);

      const safeProducts = products ?? [];
      const body = JSON.stringify(safeProducts);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({
        'Cache-Control': 'public, max-age=60, must-revalidate',
        'ETag': etag,
      });
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }

      res.json(safeProducts);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/financial-products/:id", async (req: Request, res: Response) => {
    const productId = Number(req.params.id);
    const product = await storage.getFinancialProduct(productId);
    if (!product) {
      return res.status(404).json({ message: "Financial product not found" });
    }
    res.json(product);
  });

  // Utility endpoints (public)
  app.post("/api/utils/credit-score", async (req: Request, res: Response) => {
    const { bankData } = req.body;
    if (!bankData || !Array.isArray(bankData) || bankData.length === 0) {
      return res.status(400).json({ message: "Valid bank data is required" });
    }
    const { calculateCreditScore } = await import("./utils/creditScore.js");
    const score = calculateCreditScore(bankData);
    res.json(score);
  });

  app.post("/api/utils/insurance-risk", async (req: Request, res: Response) => {
    const { bankData, userProfile } = req.body;
    if (!bankData || !Array.isArray(bankData) || bankData.length === 0) {
      return res.status(400).json({ message: "Valid bank data is required" });
    }
    if (!userProfile) {
      return res.status(400).json({ message: "User profile is required" });
    }
    const { calculateInsuranceRisk } = await import("./utils/insuranceRisk.js");
    const risk = calculateInsuranceRisk(bankData, userProfile);
    res.json(risk);
  });

  const httpServer = createServer(app);
  return httpServer;
}
