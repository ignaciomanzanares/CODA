import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { registerEmpresasRoutes } from "./routes-empresas.js";
import { registerConsentRoutes } from "./routes-consent.js";
import { registerPrivacyConsentRoutes } from "./routes-privacy-consent.js";
import { registerOnboardingRoutes, requireTwoFactorForBankLink } from "./routes-onboarding.js";
import { registerTestRoutes } from "./routes-test.js";
import { registerDocumentParsingAndScoringRoutes } from "./routes-scoring-documents.js";
import { registerDashboardRoutes } from "./routes-dashboard.js";
import { storage } from "./storage.js";
import { anonymizeUser } from "./services/privacy/accountAnonymization.js";
import { db, dialect, users, bankConnections, accounts, balances, transactions, creditScores, insuranceRisks, financialGoals, financialProducts, expenses, billSplits, billSplitParticipants, notifications, eq, and, inArray, isNull, desc, insertAccountSchema, insertBankConnectionSchema } from "./db/index.js";
import { ZodError, z } from "zod";
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
  handleRecoverMigrationPassword,
  hashPassword,
  type AuthenticatedRequest
} from "./middleware/auth.js";
import { env } from "./env.js";
import { evaluateGovernmentPrograms } from "./services/governmentPrograms.js";
import { emailService } from "./services/emailService.js";
import crypto from "crypto";
import { notificationService, expenseCategoryLabelEs } from "./services/notificationService.js";
import { apiLimiter, expensiveLimiter, authLimiter, uploadLimiter, publicLimiter } from "./middleware/rateLimiter.js";
import multer from "multer";
import { logger } from "./logger.js";
import {
  logProductRecommendationRun,
  logProductInteractionTrace,
  logProductApplicationTrace,
} from "./services/audit/traceabilityPersistence.js";
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
import type { BillSplitParticipant } from "./schema.js";

// Helper to get user ID from JWT
function getUserIdFromAuth(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  return authReq.user?.userId || '';
}

/** Fila lista para `storage.createFinancialGoal` (sin depender de insertFinancialGoalSchema del paquete). */
function rowFromCreateGoalBody(
  userId: string,
  body: z.infer<typeof createFinancialGoalSchema>
): {
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
} {
  const targetAmount = Math.round(Number(body.targetAmount));
  const currentAmount = Math.round(Number(body.currentAmount ?? 0));
  const td = body.targetDate;
  let targetDateStr: string;
  if (typeof td === "string") {
    targetDateStr = td.includes("T") ? td.split("T")[0]! : td;
  } else if (td instanceof Date) {
    targetDateStr = td.toISOString().split("T")[0]!;
  } else {
    targetDateStr = new Date(td as unknown as string).toISOString().split("T")[0]!;
  }
  return {
    userId,
    name: body.name.trim(),
    targetAmount,
    currentAmount,
    targetDate: targetDateStr,
    category: body.category || "other",
  };
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

      // Si REDIS_URL está configurada, un Redis caído rompe en silencio el rate
      // limiting distribuido y la cola de documentos (no hay fallback automático
      // a memoria una vez que ya se eligió Redis) — el load balancer debe verlo.
      const { redis } = await import("./redis.js");
      let redisStatus: "connected" | "down" | "not-configured" = "not-configured";
      if (redis) {
        try {
          await Promise.race([
            redis.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 1500)),
          ]);
          redisStatus = "connected";
        } catch {
          redisStatus = "down";
        }
      }

      const status = {
        status: redisStatus === "down" ? "degraded" : "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          database: dbHealthy ? "connected" : "in-memory",
          redis: redisStatus,
          ml_model: mlReady ? "ready" : "loading",
          auth: "jwt",
        },
        version: process.env.npm_package_version || "1.0.0",
      };

      res.status(redisStatus === "down" ? 503 : 200).json(status);
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
  /** Recuperar contraseña tras migración (requiere MIGRATION_RECOVERY_SECRET en el servidor). */
  app.post("/api/auth/recover-migration-password", authLimiter, handleRecoverMigrationPassword);
  app.post("/api/auth/logout", authenticate, handleLogout);
  app.get("/api/auth/me", authenticate, handleMe);
  
  // 2FA routes
  app.post("/api/auth/2fa/verify", authLimiter, handleVerify2FA);
  app.post("/api/auth/2fa/resend", authLimiter, handleResend2FA);
  app.post("/api/auth/2fa/enable", authenticate, handleEnable2FA);
  app.post("/api/auth/2fa/disable", authenticate, handleDisable2FA);

  // Password reset token store: token -> { userId, expiresAt }
  const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();
  // Periodic cleanup: remove expired reset tokens every hour to prevent memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [tok, val] of passwordResetTokens.entries()) {
      if (val.expiresAt < now) passwordResetTokens.delete(tok);
    }
  }, 60 * 60 * 1000).unref();
  /** Prevents duplicate financial alert notifications (max 1 per user per day). */
  const financialAlertsSent = new Set<string>();

  /** POST /api/auth/forgot-password — generates a reset link and emails it */
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    const { email } = req.body ?? {};
    // Always respond with success to avoid email enumeration
    const ok = () => res.json({ message: "Si el correo está registrado, recibirás las instrucciones." });
    if (!email || typeof email !== "string") return ok();
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
      if (!user) return ok();
      // Expire any previous token for this user
      for (const [tok, val] of passwordResetTokens.entries()) {
        if (val.userId === user.id) passwordResetTokens.delete(tok);
      }
      const token = crypto.randomBytes(32).toString("hex");
      passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 60 * 60 * 1000 });
      const resetUrl = `${env.clientUrl}/restablecer-contrasena?token=${token}`;
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      logger.error({ err }, "forgot-password error");
    }
    return ok();
  });

  /** POST /api/auth/reset-password — validates token and sets new password */
  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    const { token, password } = req.body ?? {};
    if (!token || typeof token !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({ message: "Token y contraseña son requeridos." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres." });
    }
    const entry = passwordResetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      return res.status(400).json({ message: "El enlace ha expirado o no es válido." });
    }
    try {
      await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, entry.userId));
      passwordResetTokens.delete(token);
      return res.json({ message: "Contraseña actualizada correctamente." });
    } catch (err) {
      logger.error({ err }, "reset-password error");
      return res.status(500).json({ message: "Error al actualizar la contraseña." });
    }
  });

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
  registerPrivacyConsentRoutes(app);
  registerOnboardingRoutes(app);

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

      // Bulk-fetch latest balances (single query instead of one per account)
      const accountIds = userAccounts.map((a: { id: number }) => a.id);
      const latestBalanceByAccount = await storage.getLatestBalancesForAccounts(accountIds);
      const accountsWithBalances = userAccounts.map((account: { id: number; type?: string; subtype?: string; name?: string; officialName?: string; bankConnectionId?: number }) => ({
        ...account,
        balance: latestBalanceByAccount[account.id] ?? null,
      }));

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

      // Bulk-fetch transactions for the last 90 days (single query)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const transactions = await storage.getTransactionsForAccounts(accountIds, { from: ninetyDaysAgo });

      // Flujo consolidado: descarta transferencias entre productos propios para
      // que ingreso/gasto/categorías no se cuenten doble (mismo predicado que
      // monthly-flow / insights). Las transferencias a terceros se conservan.
      const { isInternalTransferTx } = await import('./services/assistantContext.js');

      // Calculate monthly income and expenses (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentTransactions = transactions.filter(
        (t: any) => t != null && t.postedAt && new Date(t.postedAt) >= thirtyDaysAgo && !isInternalTransferTx(t)
      );
      
      const txAmount = (t: any) => parseFloat(String(t?.amount ?? 0));
      const monthlyIncome = recentTransactions
        .filter((t: any) => txAmount(t) > 0)
        .reduce((sum: number, t: any) => sum + txAmount(t), 0);
      
      const monthlyExpenses = Math.abs(recentTransactions
        .filter((t: any) => txAmount(t) < 0)
        .reduce((sum: number, t: any) => sum + txAmount(t), 0));

      const savingsRate = monthlyIncome > 0
        ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
        : 0;

      // Vista BRUTA (últimos 30 días): TODO lo que aparece en cartolas, incluidas las
      // transferencias internas (pagos de tarjeta, divisas). La vista REAL de arriba
      // (monthlyIncome/Expenses) las excluye para no inflar ingresos/gastos del score.
      const windowTx = transactions.filter(
        (t: any) => t != null && t.postedAt && new Date(t.postedAt) >= thirtyDaysAgo
      );
      const grossIncome = windowTx.filter((t: any) => txAmount(t) > 0).reduce((s: number, t: any) => s + txAmount(t), 0);
      const grossExpenses = Math.abs(windowTx.filter((t: any) => txAmount(t) < 0).reduce((s: number, t: any) => s + txAmount(t), 0));
      const gross = { income: Math.round(grossIncome), expenses: Math.round(grossExpenses), balance: Math.round(grossIncome - grossExpenses) };

      // Spending by category (last 30 days)
      const spendingByCategory: Record<string, number> = {};
      recentTransactions
        .filter((t: any) => txAmount(t) < 0)
        .forEach((t: any) => {
          const category = t?.category || 'Other';
          spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(txAmount(t));
        });

      // Últimos 6 meses calendario: ingresos y egresos reales por mes (sin ruido artificial).
      // Patrimonio: mismo valor actual por mes (no hay series históricas de saldos en BD).
      const netWorthTrend: { month: string; netWorth: number; assets: number; liabilities: number }[] = [];
      const cashFlowTrend: { month: string; income: number; expenses: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const monthLabelNw = monthStart.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
        const monthLabelCf = monthStart.toLocaleDateString("es-CL", { month: "short" });
        const inMonth = transactions.filter(
          (t: any) =>
            t != null &&
            t.postedAt &&
            new Date(t.postedAt) >= monthStart &&
            new Date(t.postedAt) <= monthEnd &&
            !isInternalTransferTx(t)
        );
        const inc = inMonth
          .filter((t: any) => txAmount(t) > 0)
          .reduce((s: number, t: any) => s + txAmount(t), 0);
        const exp = Math.abs(
          inMonth
            .filter((t: any) => txAmount(t) < 0)
            .reduce((s: number, t: any) => s + txAmount(t), 0)
        );
        cashFlowTrend.push({
          month: monthLabelCf,
          income: Math.round(inc),
          expenses: Math.round(exp),
        });
        netWorthTrend.push({
          month: monthLabelNw,
          netWorth: Math.round(netWorth),
          assets: Math.round(totalAssets),
          liabilities: Math.round(totalLiabilities),
        });
      }

      // Top spending categories
      const topCategories = Object.entries(spendingByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, amount]) => ({
          name,
          amount: Math.round(amount * 100) / 100,
          percentage:
            monthlyExpenses > 0 ? Math.round((amount / monthlyExpenses) * 100) || 0 : 0,
        }));

      // --- Augment with parsed cartola data when no linked accounts exist ---
      let finalTotalBalance = Math.round(checkingTotal + savingsTotal);
      let finalMonthlyIncome = Math.round(monthlyIncome);
      let finalMonthlyExpenses = Math.round(monthlyExpenses);
      let finalSavingsRate = savingsRate;
      let finalNetWorth = Math.round(netWorth);
      let finalTotalAssets = Math.round(totalAssets);
      let finalTotalLiabilities = Math.round(totalLiabilities);
      let docAccountCount = userAccounts.length;

      if (userAccounts.length === 0) {
        try {
          const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
          if (cartolas.length > 0) {
            // Collect all raw transactions (deduplicated by content key)
            interface RawTx { fecha: string; cargo: number; abono: number; saldo?: number; descripcion?: string }
            const seenDoc = new Set<string>();
            const allRaw: RawTx[] = [];
            for (const c of cartolas) {
              const pd = (c.parsedData as { transacciones?: RawTx[] } | null);
              for (const t of pd?.transacciones ?? []) {
                const key = `${t.fecha}|${(t.descripcion ?? "").trim().toLowerCase()}|${t.abono ?? 0}|${t.cargo ?? 0}`;
                if (seenDoc.has(key)) continue;
                seenDoc.add(key);
                allRaw.push(t);
              }
            }

            // Determine the most recent month that has transaction data
            const txDates = allRaw
              .map(t => { try { return new Date(t.fecha); } catch { return null; } })
              .filter((d): d is Date => d != null && !isNaN(d.getTime()));

            let windowStart: Date;
            let windowEnd: Date;
            if (txDates.length > 0) {
              // Use the latest transaction date as the "end" of the window
              const latestTxDate = new Date(Math.max(...txDates.map(d => d.getTime())));
              windowEnd = new Date(latestTxDate.getFullYear(), latestTxDate.getMonth() + 1, 0, 23, 59, 59);
              windowStart = new Date(latestTxDate.getFullYear(), latestTxDate.getMonth(), 1);
            } else {
              // Fallback to last 30 days from today
              windowEnd = new Date();
              windowStart = new Date();
              windowStart.setDate(windowStart.getDate() - 30);
            }

            let docIncome = 0;
            let docExpenses = 0;
            for (const tx of allRaw) {
              let txDate: Date | null = null;
              try { txDate = new Date(tx.fecha); } catch { /* skip */ }
              const inWindow = txDate && !isNaN(txDate.getTime()) && txDate >= windowStart && txDate <= windowEnd;
              if (inWindow) {
                docIncome += tx.abono ?? 0;
                docExpenses += tx.cargo ?? 0;
              }
            }

            // Use saldoFinal from the most recent cartola as balance
            const latestCartola = cartolas[0] as any;
            const latestSaldoFinal: number = (latestCartola?.parsedData as any)?.saldoFinal ?? 0;

            const docSavingsRate = docIncome > 0
              ? Math.round(((docIncome - docExpenses) / docIncome) * 100)
              : 0;

            finalTotalBalance = Math.round(latestSaldoFinal);
            finalTotalAssets = Math.round(latestSaldoFinal);
            finalMonthlyIncome = Math.round(docIncome);
            finalMonthlyExpenses = Math.round(docExpenses);
            finalSavingsRate = docSavingsRate;
            finalNetWorth = Math.round(latestSaldoFinal);
            // docAccountCount stays 0 so frontend knows there are no linked bank accounts
          }
        } catch (docErr) {
          logger.warn({ docErr }, "Failed to augment financial-summary from cartola data");
        }
      }
      // -----------------------------------------------------------------------

      res.json({
        summary: {
          totalBalance: finalTotalBalance,
          totalAssets: finalTotalAssets,
          totalLiabilities: finalTotalLiabilities,
          netWorth: finalNetWorth,
          monthlyIncome: finalMonthlyIncome,
          monthlyExpenses: finalMonthlyExpenses,
          savingsRate: finalSavingsRate,
          accountCount: docAccountCount,
          // Vista bruta (incluye transferencias internas) vs real (las excluye, arriba).
          gross,
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

  // ==========================================================================
  // AI FINANCIAL ASSISTANT
  // ==========================================================================

  /**
   * POST /api/assistant/chat
   * Chat with the AI financial assistant (non-streaming fallback)
   */
  app.post("/api/assistant/chat", authenticate, async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      const { chat } = await import('./services/aiService.js');
      const { buildFinancialContextForAssistant } = await import('./services/assistantContext.js');

      const userId = getUserIdFromAuth(req);
      let financialContext: import("./services/aiService.js").FinancialContext = {};
      try {
        financialContext = await buildFinancialContextForAssistant(userId);
      } catch (_e) {
        financialContext = {};
      }

      const response = await chat(message, conversationHistory, financialContext, userId);
      res.json(response);

      // Fire-and-forget: actualizar la memoria del asistente con este intercambio.
      // Nunca debe bloquear ni afectar la respuesta al usuario.
      void import('./services/assistantMemory.js').then(({ updateAssistantSummary }) =>
        updateAssistantSummary(userId, message, response.message),
      ).catch(() => { /* ya logueado dentro */ });
    } catch (error) {
      logger.error({ err: error }, 'AI Assistant chat error');
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  /**
   * POST /api/assistant/chat/stream
   * SSE streaming chat with the AI financial assistant
   */
  app.post("/api/assistant/chat/stream", authenticate, async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      const { getStreamGenerator, parseStructuredResponse } = await import('./services/aiService.js');
      const { buildFinancialContextForAssistant } = await import('./services/assistantContext.js');

      const userId = getUserIdFromAuth(req);
      let financialContext: import("./services/aiService.js").FinancialContext = {};
      try {
        financialContext = await buildFinancialContextForAssistant(userId);
      } catch (_e) {
        financialContext = {};
      }

      const result = getStreamGenerator(message, conversationHistory, financialContext, userId);
      if (!result) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${JSON.stringify({ type: 'error', content: 'IA no configurada en el servidor.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      let fullText = '';
      try {
        for await (const event of result.stream) {
          if (typeof event === 'string') {
            fullText += event;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: event })}\n\n`);
          } else {
            // Eventos de herramientas (tool_start / tool_end) — la UI los puede
            // usar para mostrar "Consultando tus gastos…" durante la pausa.
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        }

        // Parse the complete response for structured data (suggestions, actionItems)
        const parsed = parseStructuredResponse(fullText);
        res.write(`data: ${JSON.stringify({
          type: 'done',
          suggestions: parsed.suggestions,
          actionItems: parsed.actionItems,
          provider: result.provider,
          // If model returned JSON, send the clean message (without JSON wrapper)
          message: parsed.message !== fullText ? parsed.message : undefined,
        })}\n\n`);
      } catch (streamError) {
        logger.error({ err: streamError }, 'AI stream error');
        res.write(`data: ${JSON.stringify({ type: 'error', content: 'Error en la respuesta del modelo.' })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();

      // Fire-and-forget: actualizar la memoria del asistente. Solo si la
      // respuesta tiene contenido real (no fue un error a media stream).
      if (fullText.trim().length > 0) {
        void import('./services/assistantMemory.js').then(({ updateAssistantSummary }) =>
          updateAssistantSummary(userId, message, fullText),
        ).catch(() => { /* ya logueado dentro */ });
      }
    } catch (error) {
      logger.error({ err: error }, 'AI Assistant stream error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process message' });
      } else {
        res.end();
      }
    }
  });

  /**
   * GET /api/assistant/insights
   * Get quick AI insights for the dashboard
   */
  app.get("/api/assistant/insights", authenticate, async (req, res) => {
    try {
      const { getQuickInsights } = await import('./services/aiService.js');
      const { buildFinancialContextForAssistant } = await import('./services/assistantContext.js');
      const userId = getUserIdFromAuth(req);
      const context = await buildFinancialContextForAssistant(userId);
      const insights = getQuickInsights(context);
      res.json({ insights });
    } catch (error) {
      logger.error({ err: error }, 'AI insights error');
      res.status(500).json({ error: 'Failed to get insights' });
    }
  });

  /**
   * POST /api/assistant/feedback
   * Thumbs up/down sobre una respuesta del asistente. Guardamos el par
   * usuario/asistente + proveedor para evaluar cambios futuros.
   */
  app.post("/api/assistant/feedback", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { rating, userMessage, assistantMessage, provider, comment } = req.body ?? {};

      if (rating !== 'up' && rating !== 'down') {
        return res.status(400).json({ error: 'rating debe ser "up" o "down"' });
      }
      if (typeof userMessage !== 'string' || typeof assistantMessage !== 'string') {
        return res.status(400).json({ error: 'userMessage y assistantMessage son requeridos' });
      }
      // Truncamos para evitar payloads abusivos en la BD.
      const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

      await storage.createAssistantFeedback({
        userId,
        rating,
        userMessage: trim(userMessage, 2000),
        assistantMessage: trim(assistantMessage, 8000),
        provider: typeof provider === 'string' ? provider : undefined,
        comment: typeof comment === 'string' ? trim(comment, 1000) : undefined,
      });

      res.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, 'Assistant feedback error');
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  /** Mensaje inicial y chips del chat (datos reales, sin plantillas genéricas). */
  app.get("/api/assistant/bootstrap", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { buildAssistantBootstrap } = await import("./services/assistantBootstrap.js");
      const payload = await buildAssistantBootstrap(userId);
      res.json(payload);
    } catch (e) {
      logger.error({ err: e }, "assistant bootstrap error");
      res.status(500).json({ message: "Error al preparar el asistente." });
    }
  });

  /** Recomendaciones del plan financiero calculadas con gastos, cuentas y scores. */
  app.get("/api/plan/insights", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { buildPlanInsights } = await import("./services/planInsights.js");
      const payload = await buildPlanInsights(userId);
      res.json(payload);
    } catch (e) {
      logger.error({ err: e }, "plan insights error");
      res.status(500).json({ message: "Error al calcular el plan." });
    }
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
    // Onboarding: el 2FA es obligatorio antes de vincular un banco (no-op si el
    // flag ENABLE_ONBOARDING está apagado → no cambia el flujo actual).
    const guard = await requireTwoFactorForBankLink(userId);
    if (!guard.ok) return res.status(409).json({ message: guard.message, requires2FA: true });
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
    const authReq = req as AuthenticatedRequest;
    const userId = await ensureUserForToken(authReq.user!);
    if (!userId) {
      return res.status(401).json({ message: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
    }
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
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(401).json({
          message: 'No pudimos sincronizar tu cuenta con la base de datos. Cierra sesión y vuelve a entrar.',
        });
      }

      const goal = await storage.createFinancialGoal(
        rowFromCreateGoalBody(userId, req.body as z.infer<typeof createFinancialGoalSchema>)
      );
      // Emit a creation notification (non-blocking)
      try {
        await notificationService.notifyGoalCreated(userId, goal.name, goal.id as number);
      } catch (notificationError) {
        logger.error({ err: notificationError }, 'Error creating goal notification');
      }
      res.status(201).json(goal);
    } catch (error) {
      const e = error as { code?: string; message?: string };
      console.error('[GOALS ERROR]', error);
      logger.error({ err: error, pgCode: e?.code }, 'financial-goals POST failed');
      // 42P01 = relation does not exist (tabla financial_goals no creada en Postgres)
      if (e?.code === '42P01' && String(e?.message ?? '').includes('financial_goals')) {
        logger.warn(
          'financial_goals table missing: run `npm run db:migrate` or psql -f migrations/013_financial_goals.sql'
        );
        return res.status(503).json({
          message: 'No pudimos guardar la meta. Intenta de nuevo en unos minutos.',
        });
      }
      return res.status(500).json({
        message: 'No pudimos guardar la meta. Intenta de nuevo.',
      });
    }
  });

  app.put("/api/financial-goals/:id", authenticate, validateParams(idParamSchema), validateBody(updateFinancialGoalSchema), async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = await ensureUserForToken(authReq.user!);
    if (!userId) {
      return res.status(401).json({ message: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
    }
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
    const authReq = req as AuthenticatedRequest;
    const userId = await ensureUserForToken(authReq.user!);
    if (!userId) {
      return res.status(401).json({ message: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
    }
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

  // =====================================================
  // PUSH NOTIFICATION ENDPOINTS
  // =====================================================

  // Get VAPID public key (needed by frontend to subscribe)
  app.get("/api/push/vapid-key", async (_req, res) => {
    try {
      const { getVapidPublicKey } = await import('./services/pushService.js');
      const key = getVapidPublicKey();
      if (!key) {
        return res.status(503).json({ message: "Push notifications not configured" });
      }
      res.json({ publicKey: key });
    } catch (error) {
      res.status(503).json({ message: "Push not available" });
    }
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { subscription } = req.body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ message: "Invalid push subscription" });
      }
      const { saveSubscription } = await import('./services/pushService.js');
      await saveSubscription(userId, subscription, req.headers['user-agent']);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to save push subscription");
      res.status(500).json({ message: "Error saving subscription" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/push/unsubscribe", authenticate, async (req: Request, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ message: "Missing endpoint" });
      }
      const { removeSubscription } = await import('./services/pushService.js');
      await removeSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to remove push subscription");
      res.status(500).json({ message: "Error removing subscription" });
    }
  });

  // Test push notification (dev/debug)
  app.post("/api/push/test", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { sendPushToUser } = await import('./services/pushService.js');
      const sent = await sendPushToUser(userId, {
        title: "CODA — Prueba",
        body: "¡Las notificaciones push funcionan correctamente!",
        url: "/panel",
      });
      res.json({ success: true, devicesSent: sent });
    } catch (error) {
      logger.error({ error }, "Failed to send test push");
      res.status(500).json({ message: "Error al enviar la notificación de prueba" });
    }
  });

  // Document upload: Import enhanced middleware with validation, OCR support
  const { documentUpload } = await import("./middleware/uploadMiddleware.js");
  app.post(
    "/api/documents/upload",
    authenticate,
    uploadLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      documentUpload.single("document")(req, res, (err: unknown) => {
        if (err) {
          // Import multer error handler
          const { handleMulterError } = require('./middleware/uploadMiddleware.js');
          const errorMessage = handleMulterError(err);
          return res.status(400).json({ 
            message: errorMessage,
            step: 'validation'
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      
      try {
        // 1. Ensure user exists
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) {
          return res.status(404).json({
            message: "Usuario no encontrado. Inicia sesión de nuevo o regístrate.",
            step: 'auth'
          });
        }
        
        // 2. Validate file presence
        const file = (req as { file?: Express.Multer.File }).file;
        if (!file?.buffer) {
          return res.status(400).json({ 
            message: "No se recibió ningún archivo. Usa el campo 'document'.",
            step: 'validation'
          });
        }
        
        // 3. Enhanced validation
        const { validateDocument } = await import('./services/documents/documentValidator.js');
        const validation = validateDocument({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        });
        
        if (!validation.valid) {
          logger.warn(
            { userId, filename: file.originalname, errors: validation.errors },
            '[Upload] Validation failed'
          );
          return res.status(400).json({
            message: validation.errors.join(' '),
            errors: validation.errors,
            warnings: validation.warnings,
            step: 'validation',
          });
        }
        
        // Log warnings if any
        if (validation.warnings && validation.warnings.length > 0) {
          logger.warn(
            { userId, warnings: validation.warnings },
            '[Upload] Validation warnings'
          );
        }
        
        // 4. Process document — en cola (BullMQ) si hay Redis configurado, para no bloquear el
        // request HTTP con OCR/parseo PDF + scoring; si no, igual que antes (síncrono).
        const { documentQueue } = await import("./queues/documentQueue.js");
        if (documentQueue) {
          const job = await documentQueue.add("upload", {
            userId,
            fileBase64: file.buffer.toString("base64"),
          });
          return res.status(202).json({
            step: "queued",
            jobId: job.id,
            metadata: {
              originalName: file.originalname,
              size: file.size,
              uploadedAt: new Date().toISOString(),
            },
            warnings: validation.warnings,
          });
        }

        const { processDocumentUpload } = await import("./services/documents/index.js");
        const result = await processDocumentUpload(userId, file.buffer);

        if (result.error) {
          logger.warn(
            { userId, error: result.error, step: result.step },
            '[Upload] Document processing failed'
          );
          return res.status(400).json({
            message: result.error,
            step: result.step,
            warnings: validation.warnings
          });
        }

        // 5. Success response with warnings
        res.json({
          ...result,
          warnings: validation.warnings,
          metadata: {
            originalName: file.originalname,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          },
        });

      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error procesando documento";
        
        // Specific error handling
        if (msg.includes("password") || msg.includes("encrypted") || msg.includes("protected")) {
          return res.status(400).json({
            message: "El PDF está protegido o encriptado. Usa un documento sin contraseña.",
            step: 'extraction',
          });
        }
        
        if (msg.includes("Invalid PDF")) {
          return res.status(400).json({
            message: "El archivo no es un PDF válido. Verifica que no esté corrupto.",
            step: 'extraction',
          });
        }
        
        // Generic error
        logger.error({ err: e, userId: authReq.user?.userId }, "Document upload failed");
        res.status(500).json({ 
          message: "Error al procesar el documento. Intenta de nuevo o contacta soporte.",
          step: 'processing',
        });
      }
    }
  );

  // GET /api/documents/upload/:jobId — polling de estado para uploads encolados (ver POST arriba).
  // Solo aplica cuando hay Redis configurado; sin Redis el POST ya responde con el resultado final.
  app.get("/api/documents/upload/:jobId", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { documentQueue } = await import("./queues/documentQueue.js");
      if (!documentQueue) {
        return res.status(404).json({ message: "No hay cola de procesamiento configurada." });
      }

      const job = await documentQueue.getJob(req.params.jobId);
      if (!job || job.data.userId !== userId) {
        return res.status(404).json({ message: "Job no encontrado." });
      }

      const state = await job.getState();
      if (state === "completed") {
        return res.json({ step: "done", state, result: job.returnvalue });
      }
      if (state === "failed") {
        return res.status(500).json({ step: "processing", state, message: job.failedReason });
      }
      return res.json({ step: "queued", state });
    } catch (e) {
      logger.error({ err: e, userId: authReq.user?.userId }, "Document upload job status check failed");
      res.status(500).json({ message: "Error al consultar el estado del documento." });
    }
  });

  // DELETE /api/documents — clear all movement documents (documentUploads table only)
  app.delete("/api/documents", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      // Cascada: borrar las transacciones normalizadas de todas las cartolas.
      const { deleteTransactionsForDocument } = await import("./services/documents/normalizeCartola.js");
      const scoreDocs = await storage.listScoreDocumentUploadsByType(userId, "cartola");
      for (const s of scoreDocs) await deleteTransactionsForDocument(userId, s.id).catch(() => {});
      await storage.deleteAllScoreDocumentUploads(userId).catch(() => {});
      await storage.deleteAllDocumentUploads(userId);
      res.json({ success: true, message: "Movimientos y gastos eliminados." });
    } catch (e) {
      logger.error({ err: e, userId: authReq.user?.userId }, "Delete document uploads failed");
      res.status(500).json({ message: "Error al eliminar movimientos." });
    }
  });

  // DELETE /api/score/documents — clear all score documents AND score results for the user
  app.delete("/api/score/documents", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      // Delete score documents + transactional score + credit score atomically
      await Promise.all([
        storage.deleteAllScoreDocumentUploads(userId),
        storage.deleteTransactionalScore(userId),
        storage.deleteCreditScore(userId),
      ]);
      res.json({ success: true, message: "Datos del Score eliminados." });
    } catch (e) {
      logger.error({ err: e, userId: authReq.user?.userId }, "Delete score documents failed");
      res.status(500).json({ message: "Error al eliminar datos del Score." });
    }
  });

  // GET /api/score/documents/count — count of score documents for the user
  app.get("/api/score/documents/count", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const count = await storage.countScoreDocumentUploads(userId);
      res.json({ count });
    } catch (e) {
      logger.error({ err: e }, "Count score documents failed");
      res.status(500).json({ message: "Error al contar documentos." });
    }
  });

  // GET /api/transactions/parsed — all transactions extracted from uploaded cartola documents
  app.get("/api/transactions/parsed", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      // Lee de la tabla normalizada `transactions` (fuente de verdad) + `accounts`,
      // para mostrar cuenta/producto y filtrar por él. Antes leía parsed_data (JSON).
      const userAccounts = await storage.getAccounts(userId);
      const accById = new Map<number, { id: number; name?: string | null; type?: string | null; subtype?: string | null }>(
        userAccounts.map((a: { id: number }) => [a.id as number, a as never]),
      );
      const accIds = userAccounts.map((a: { id: number }) => a.id as number);
      const rows = accIds.length ? await storage.getTransactionsForAccounts(accIds) : [];

      // Producto legible + clave de filtro (Cuenta corriente / TC Nacional / TC Internacional).
      function productOf(a: { name?: string | null; subtype?: string | null } | undefined): { key: string; label: string } {
        const name = a?.name ?? "Cuenta";
        if (a?.subtype === "credit_card") {
          if (/internacional/i.test(name)) return { key: "tc_internacional", label: `${name} \u00b7 Tarjeta cr\u00e9dito` };
          if (/nacional/i.test(name)) return { key: "tc_nacional", label: `${name} \u00b7 Tarjeta cr\u00e9dito` };
          return { key: "tc", label: `${name} \u00b7 Tarjeta cr\u00e9dito` };
        }
        return { key: "checking", label: `${name} \u00b7 Cuenta corriente` };
      }

      const transactions = (rows as Array<Record<string, unknown>>).map((t) => {
        const acc = accById.get(t.accountId as number);
        const monto = Number(t.amount);
        const prod = productOf(acc);
        return {
          id: String(t.id),
          fecha: String(t.postedAt).slice(0, 10),
          descripcion: (t.description as string) ?? "",
          monto,
          tipo: monto >= 0 ? "ingreso" : "egreso",
          saldo: null,
          banco: acc?.name ?? null,
          accountId: t.accountId as number,
          accountName: acc?.name ?? null,
          accountType: acc?.type ?? null,
          accountSubtype: acc?.subtype ?? null,
          product: prod.key,
          productLabel: prod.label,
          categoria: (t.category as string) ?? "otro",
          category_confidence: typeof t.categoryConfidence === "number" ? t.categoryConfidence : null,
          isInternalTransfer: Number(t.isInternalTransfer ?? 0) === 1,
          periodoDesde: null,
          periodoHasta: null,
        };
      });

      transactions.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0));
      res.json({ transactions, count: transactions.length });
    } catch (e) {
      logger.error({ err: e }, "Failed to get parsed transactions");
      res.status(500).json({ message: "Error al obtener transacciones." });
    }
  });

  // PATCH /api/transactions/:id/category — update a single transaction's category
  const VALID_CATEGORIES = new Set([
    "vivienda", "alimentacion", "transporte", "seguros", "servicios_basicos",
    "salud_bienestar", "educacion", "cuidado_personal",
    "diversion", "hobbies", "suscripciones",
    "deudas", "inversiones", "ahorros",
    "regalos", "reparaciones", "imprevistos",
    "telecomunicaciones", "transferencia_enviada", "transferencia_recibida",
    "comercio", "entretenimiento", "restaurantes", "salud", "ingreso_principal", "servicios", "otro",
  ]);

  app.patch("/api/transactions/:id/category", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { category } = req.body as { category?: string };
      if (!category || !VALID_CATEGORIES.has(category)) {
        return res.status(400).json({ message: `Categoría inválida. Opciones: ${[...VALID_CATEGORIES].join(", ")}` });
      }

      // ID format: "{documentUploadId}-{transactionIndex}"
      const txId = req.params.id;
      const dashIdx = txId.lastIndexOf("-");
      if (dashIdx < 0) return res.status(400).json({ message: "ID de transacción inválido." });

      const docId = txId.slice(0, dashIdx);
      const txIndex = parseInt(txId.slice(dashIdx + 1), 10);
      if (isNaN(txIndex)) return res.status(400).json({ message: "Índice de transacción inválido." });

      // Fetch the document upload and verify ownership
      const doc = await storage.getDocumentUploadById(docId, userId);
      if (!doc) return res.status(404).json({ message: "Documento no encontrado." });

      const pd = doc.parsedData as { transacciones?: any[] } | null;
      const txs = pd?.transacciones;
      if (!txs || txIndex < 0 || txIndex >= txs.length) {
        return res.status(404).json({ message: "Transacción no encontrada." });
      }

      // Update the category in-place
      txs[txIndex].categoria = category;
      await storage.updateDocumentUploadParsedData(docId, pd);

      res.json({ id: txId, category });
    } catch (e) {
      logger.error({ err: e }, "Failed to update transaction category");
      res.status(500).json({ message: "Error al actualizar categoría." });
    }
  });

  // GET /api/transactions/summary — income, expenses, and balance summary
  app.get("/api/transactions/summary", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");

      let totalIncome = 0;
      let totalExpenses = 0;
      let transactionCount = 0;
      const categoryBreakdown: Record<string, { count: number; total: number }> = {};
      const monthlyData: Record<string, { income: number; expenses: number }> = {};

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: any[]; saldo_inicial?: number; saldo_final?: number } | null;
        const txs = pd?.transacciones ?? [];

        for (const t of txs) {
          let monto: number;
          let tipo: 'ingreso' | 'egreso';
          let fecha: string;
          let categoria = 'otro';

          // Extract amount and type
          if ('tipo' in t && typeof t.monto === 'number') {
            // New format
            monto = t.monto;
            tipo = t.tipo === 'abono' ? 'ingreso' : 'egreso';
          } else {
            // Old format (CartolaExtraida: cargo/abono)
            const abono = t.abono ?? 0;
            const cargo = t.cargo ?? 0;
            if (abono > 0) {
              monto = abono;
              tipo = 'ingreso';
            } else {
              monto = cargo;
              tipo = 'egreso';
            }
          }
          categoria = t.categoria ?? 'otro';

          // Extract and normalize date
          if (t.fecha instanceof Date) {
            fecha = t.fecha.toISOString().slice(0, 10);
          } else if (typeof t.fecha === 'string') {
            if (t.fecha.includes('/')) {
              const parts = t.fecha.split('/');
              if (parts.length === 3) {
                if (parts[2].length === 2) {
                  fecha = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else {
                  fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
              } else {
                fecha = t.fecha.slice(0, 10);
              }
            } else {
              fecha = t.fecha.slice(0, 10);
            }
          } else {
            fecha = new Date().toISOString().slice(0, 10);
          }

          // Skip zero amounts
          if (monto === 0) continue;

          transactionCount++;

          // Add to totals
          if (tipo === 'ingreso') {
            totalIncome += monto;
          } else {
            totalExpenses += monto;
          }

          // Category breakdown
          if (!categoryBreakdown[categoria]) {
            categoryBreakdown[categoria] = { count: 0, total: 0 };
          }
          categoryBreakdown[categoria].count++;
          categoryBreakdown[categoria].total += monto;

          // Monthly data
          const monthKey = fecha.slice(0, 7); // YYYY-MM
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { income: 0, expenses: 0 };
          }
          if (tipo === 'ingreso') {
            monthlyData[monthKey].income += monto;
          } else {
            monthlyData[monthKey].expenses += monto;
          }
        }
      }

      // Sort monthly data by date
      const sortedMonthlyData = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data }));

      // Get latest cartola for balance info
      let currentBalance: number | null = null;
      if (cartolas.length > 0) {
        const latestCartola = cartolas[0];
        const pd = latestCartola.parsedData as { saldo_final?: number; saldoFinal?: number } | null;
        currentBalance = pd?.saldo_final ?? pd?.saldoFinal ?? null;
      }

      // Compute monthly averages using the last 3 months (more stable than all-time totals)
      const recentMonths = sortedMonthlyData.slice(-3);
      const avgMonthlyIncome = recentMonths.length > 0
        ? Math.round(recentMonths.reduce((s, m) => s + m.income, 0) / recentMonths.length)
        : Math.round(totalIncome / Math.max(1, sortedMonthlyData.length));
      const avgMonthlyExpenses = recentMonths.length > 0
        ? Math.round(recentMonths.reduce((s, m) => s + m.expenses, 0) / recentMonths.length)
        : Math.round(totalExpenses / Math.max(1, sortedMonthlyData.length));

      res.json({
        summary: {
          totalIncome,
          totalExpenses,
          netBalance: totalIncome - totalExpenses,
          currentBalance,
          transactionCount,
          documentCount: cartolas.length,
          avgMonthlyIncome,
          avgMonthlyExpenses,
        },
        categoryBreakdown,
        monthlyData: sortedMonthlyData,
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to get transactions summary");
      res.status(500).json({ message: "Error al obtener el resumen de transacciones." });
    }
  });

  // GET /api/transactions/monthly-comparison — per-category monthly spending for MoM comparison
  app.get("/api/transactions/monthly-comparison", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");

      // month → category → total
      const grid: Record<string, Record<string, number>> = {};
      const allCategories = new Set<string>();

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: any[] } | null;
        for (const t of pd?.transacciones ?? []) {
          let monto: number;
          let cat: string;
          let fecha: string;

          if ('tipo' in t && typeof t.monto === 'number') {
            if (t.tipo !== 'cargo') continue;
            monto = t.monto;
          } else {
            monto = t.cargo ?? 0;
            if (monto <= 0) continue;
          }
          cat = t.categoria ?? 'otro';

          if (typeof t.fecha === 'string') {
            if (t.fecha.includes('/')) {
              const parts = t.fecha.split('/');
              if (parts.length === 3) {
                fecha = `${parts[2].length === 2 ? '20' + parts[2] : parts[2]}-${parts[1].padStart(2, '0')}`;
              } else {
                fecha = t.fecha.slice(0, 7);
              }
            } else {
              fecha = t.fecha.slice(0, 7);
            }
          } else {
            continue;
          }

          if (!grid[fecha]) grid[fecha] = {};
          grid[fecha][cat] = (grid[fecha][cat] ?? 0) + monto;
          allCategories.add(cat);
        }
      }

      // Build sorted months array
      const months = Object.keys(grid).sort();
      const categories = [...allCategories].sort();

      // Build comparison rows per category
      const comparison = categories.map(cat => {
        const monthlyTotals = months.map(m => ({
          month: m,
          total: grid[m]?.[cat] ?? 0,
        }));

        // Calculate MoM change for the last two months
        const last = monthlyTotals.length >= 1 ? monthlyTotals[monthlyTotals.length - 1].total : 0;
        const prev = monthlyTotals.length >= 2 ? monthlyTotals[monthlyTotals.length - 2].total : 0;
        const change = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;

        return {
          categoria: cat,
          months: monthlyTotals,
          lastMonth: last,
          previousMonth: prev,
          changePct: change,
        };
      }).sort((a, b) => b.lastMonth - a.lastMonth);

      res.json({ months, comparison });
    } catch (e) {
      logger.error({ err: e }, "Failed to get monthly comparison");
      res.status(500).json({ message: "Error al obtener comparación mensual." });
    }
  });

  // GET /api/transactions/monthly-flow — income vs expenses by month (last 12 months)
  app.get("/api/transactions/monthly-flow", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { isInternalTransferTx } = await import('./services/assistantContext.js');
      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
      const byMonth: Record<string, { ingresos: number; egresos: number }> = {};

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: any[] } | null;
        for (const t of pd?.transacciones ?? []) {
          // Flujo consolidado: excluye movimientos entre productos propios para
          // no contar doble (fondeo/pago de tarjeta, divisas). Terceros se mantienen.
          if (isInternalTransferTx(t)) continue;

          let fecha: string;
          if (typeof t.fecha === "string") {
            fecha = t.fecha.includes("/")
              ? (() => { const p = t.fecha.split("/"); return p.length === 3 ? `${p[2].length === 2 ? "20" + p[2] : p[2]}-${p[1].padStart(2, "0")}` : t.fecha.slice(0, 7); })()
              : t.fecha.slice(0, 7);
          } else continue;

          if (!byMonth[fecha]) byMonth[fecha] = { ingresos: 0, egresos: 0 };

          if ("tipo" in t && typeof t.monto === "number") {
            if (t.tipo === "abono") byMonth[fecha].ingresos += t.monto;
            else if (t.tipo === "cargo") byMonth[fecha].egresos += t.monto;
          } else {
            byMonth[fecha].ingresos += t.abono ?? 0;
            byMonth[fecha].egresos += t.cargo ?? 0;
          }
        }
      }

      const MONTH_LABELS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      const now = new Date();
      const result = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const entry = byMonth[key];
        if (!entry) continue;
        result.push({
          month: key,
          label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
          ingresos: Math.round(entry.ingresos),
          egresos: Math.round(entry.egresos),
          balance: Math.round(entry.ingresos - entry.egresos),
        });
      }

      res.json({ months: result });
    } catch (e) {
      logger.error({ err: e }, "Failed to get monthly flow");
      res.status(500).json({ message: "Error al obtener flujo mensual." });
    }
  });

  // GET /api/transactions/insights — behavioral insights derived from cartola data
  app.get("/api/transactions/insights", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { isInternalTransferTx } = await import('./services/assistantContext.js');
      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
      interface NewFmtTx { fecha: string; tipo: 'cargo'|'abono'; monto: number; categoria?: string; descripcion: string }
      interface OldFmtTx { fecha: string; cargo: number; abono: number; descripcion: string }
      type AnyTx = NewFmtTx | OldFmtTx;

      // Collect all egresos with category and date
      const egresos: { fecha: string; monto: number; categoria: string; dia: number }[] = [];
      const seen = new Set<string>();

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: AnyTx[] } | null;
        for (const t of pd?.transacciones ?? []) {
          // Excluye movimientos internos propios para no inflar el gasto (mismo
          // predicado que monthly-flow / dashboard). Terceros se mantienen.
          if (isInternalTransferTx(t as any)) continue;
          let monto: number; let cat: string;
          if ('tipo' in t && typeof (t as NewFmtTx).monto === 'number') {
            const nt = t as NewFmtTx;
            if (nt.tipo !== 'cargo') continue;
            monto = nt.monto;
          } else {
            const ot = t as OldFmtTx;
            monto = ot.cargo ?? 0;
            if (monto <= 0) continue;
          }
          cat = (t as any).categoria ?? 'otro';
          const fechaStr = (t.fecha as string).slice(0, 10);
          const key = `${fechaStr}|${(t.descripcion ?? '').trim().toLowerCase()}|${monto}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const dia = new Date(fechaStr + 'T12:00:00').getDate();
          egresos.push({ fecha: fechaStr, monto, categoria: cat, dia });
        }
      }

      // ── Gastos por categoría ──────────────────────────────────────────────
      const byCategoria: Record<string, number> = {};
      for (const e of egresos) {
        byCategoria[e.categoria] = (byCategoria[e.categoria] ?? 0) + e.monto;
      }
      const totalEgresos = Object.values(byCategoria).reduce((s, v) => s + v, 0);
      const spendingByCategory = Object.entries(byCategoria)
        .map(([cat, total]) => ({ categoria: cat, total, pct: totalEgresos > 0 ? Math.round((total / totalEgresos) * 100) : 0 }))
        .sort((a, b) => b.total - a.total);

      // ── Smart Insights ────────────────────────────────────────────────────
      const insights: { type: string; title: string; body: string; icon: string }[] = [];

      // 1. Quincena fuerte: ¿más gasto en primera o segunda mitad del mes?
      const primeraQ = egresos.filter(e => e.dia <= 15).reduce((s, e) => s + e.monto, 0);
      const segundaQ = egresos.filter(e => e.dia > 15).reduce((s, e) => s + e.monto, 0);
      if (primeraQ > 0 || segundaQ > 0) {
        if (primeraQ > segundaQ * 1.3) {
          insights.push({ type: 'pattern', icon: 'calendar', title: 'Gastas más los primeros 15 días', body: `El ${Math.round((primeraQ / (primeraQ + segundaQ)) * 100)}% de tus egresos ocurren en la primera quincena del mes.` });
        } else if (segundaQ > primeraQ * 1.3) {
          insights.push({ type: 'pattern', icon: 'calendar', title: 'Gastas más la segunda quincena', body: `El ${Math.round((segundaQ / (primeraQ + segundaQ)) * 100)}% de tus egresos ocurren en la segunda mitad del mes.` });
        }
      }

      // 2. Categoría dominante
      if (spendingByCategory.length > 0) {
        const top = spendingByCategory[0];
        if (top.pct >= 30) {
          const labels: Record<string, string> = { alimentacion: 'Alimentación', transporte: 'Transporte', entretenimiento: 'Entretenimiento', telecomunicaciones: 'Telecomunicaciones', transferencia_enviada: 'Transferencias', comercio: 'Comercio', educacion: 'Educación', salud: 'Salud', otro: 'Otros' };
          insights.push({ type: 'alert', icon: 'pie-chart', title: `${labels[top.categoria] ?? top.categoria} concentra el ${top.pct}% de tus gastos`, body: 'Evalúa si puedes reducir o renegociar en esta categoría.' });
        }
      }

      // 3. Pagos recurrentes
      const descCount: Record<string, number> = {};
      for (const e of egresos) {
        const k = e.categoria + '|' + e.monto;
        descCount[k] = (descCount[k] ?? 0) + 1;
      }
      const recurrentes = Object.entries(descCount).filter(([, v]) => v >= 2).length;
      if (recurrentes > 0) {
        insights.push({ type: 'info', icon: 'repeat', title: `${recurrentes} cargo${recurrentes > 1 ? 's' : ''} recurrente${recurrentes > 1 ? 's' : ''} detectado${recurrentes > 1 ? 's' : ''}`, body: 'Revisa si todos los cargos periódicos siguen siendo necesarios.' });
      }

      // 4. Balance saludable
      const ingresos = cartolas.reduce((s, c) => {
        const pd = c.parsedData as { transacciones?: AnyTx[] } | null;
        for (const t of pd?.transacciones ?? []) {
          if (isInternalTransferTx(t as any)) continue; // mismo predicado consolidado
          if ('tipo' in t && (t as NewFmtTx).tipo === 'abono') s += (t as NewFmtTx).monto;
          else if ('abono' in t) s += (t as OldFmtTx).abono ?? 0;
        }
        return s;
      }, 0);
      const tasaAhorro = ingresos > 0 ? Math.round(((ingresos - totalEgresos) / ingresos) * 100) : 0;
      if (ingresos > 0 && totalEgresos > 0) {
        if (tasaAhorro >= 20) {
          insights.push({ type: 'positive', icon: 'trending-up', title: `Tasa de ahorro del ${tasaAhorro}%`, body: 'Estás ahorrando sobre el umbral recomendado del 20%. ¡Buen trabajo!' });
        } else if (tasaAhorro < 5 && tasaAhorro >= 0) {
          insights.push({ type: 'warning', icon: 'alert-triangle', title: `Tasa de ahorro baja (${tasaAhorro}%)`, body: 'Tus egresos consumen casi la totalidad de tus ingresos. Considera reducir gastos variables.' });
        } else if (tasaAhorro < 0) {
          insights.push({ type: 'alert', icon: 'alert-circle', title: 'Egresos superan ingresos', body: `Tus gastos superan tus ingresos en un ${Math.abs(tasaAhorro)}% en el período analizado.` });
        }
      }

      // 5. Savings projection — if positive savings, project 6 and 12 months
      if (ingresos > 0 && tasaAhorro > 0) {
        const ahorroMensual = Math.round((ingresos - totalEgresos));
        const ahorro6m = ahorroMensual * 6;
        const ahorro12m = ahorroMensual * 12;
        const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
        insights.push({
          type: 'positive', icon: 'piggy-bank',
          title: `Podrías ahorrar $${fmt(ahorro12m)} en 12 meses`,
          body: `Manteniendo tu ritmo actual (~$${fmt(ahorroMensual)}/mes), en 6 meses acumularías ~$${fmt(ahorro6m)} y en 1 año ~$${fmt(ahorro12m)}. Automatizar la transferencia a una cuenta de ahorro protege ese monto.`,
        });
      }

      // 6. Category reduction tip — top category reduction by 15%
      if (spendingByCategory.length > 0 && totalEgresos > 0) {
        const top = spendingByCategory[0];
        const labels: Record<string, string> = { alimentacion: 'alimentación', transporte: 'transporte', entretenimiento: 'entretenimiento', telecomunicaciones: 'telecomunicaciones', transferencia_enviada: 'transferencias', comercio: 'comercio', educacion: 'educación', salud: 'salud', otro: 'otros' };
        const reduction = Math.round(top.total * 0.15);
        const annualSave = reduction * 12;
        if (reduction > 1000 && top.pct >= 20) {
          const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          insights.push({
            type: 'info', icon: 'lightbulb',
            title: `Reducir ${labels[top.categoria] ?? top.categoria} un 15% = $${fmt(reduction)}/mes`,
            body: `Si logras bajar tu gasto en ${labels[top.categoria] ?? top.categoria} un 15%, ahorrarías ~$${fmt(annualSave)} al año. Evalúa suscripciones, frecuencia de compras y alternativas más económicas.`,
          });
        }
      }

      // 7. Recurring expense total
      const recurringDescs: { desc: string; monto: number; count: number }[] = [];
      const descMontoCount: Record<string, { desc: string; monto: number; count: number }> = {};
      for (const e of egresos) {
        const k = `${e.monto}`;
        if (!descMontoCount[k]) descMontoCount[k] = { desc: e.categoria, monto: e.monto, count: 0 };
        descMontoCount[k].count++;
      }
      let totalRecurrente = 0;
      for (const v of Object.values(descMontoCount)) {
        if (v.count >= 2) { recurringDescs.push(v); totalRecurrente += v.monto; }
      }
      if (totalRecurrente > 0 && ingresos > 0) {
        const pctRecurrente = Math.round((totalRecurrente / ingresos) * 100);
        if (pctRecurrente >= 15) {
          const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          insights.push({
            type: pctRecurrente >= 50 ? 'warning' : 'info', icon: 'repeat',
            title: `$${fmt(totalRecurrente)} en cargos recurrentes (${pctRecurrente}% de ingresos)`,
            body: `Tus pagos periódicos consumen el ${pctRecurrente}% de tus ingresos. Renegociar planes de telefonía, streaming o seguros puede liberar dinero mensual.`,
          });
        }
      }

      // 8. Emergency fund check
      if (ingresos > 0) {
        const gastoMensual = totalEgresos;
        const lastCartola = cartolas[0] as any;
        const saldoActual: number = (lastCartola?.parsedData as any)?.saldoFinal ?? 0;
        const mesesCubiertos = gastoMensual > 0 ? Math.round((saldoActual / gastoMensual) * 10) / 10 : 0;
        const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
        if (mesesCubiertos < 1 && saldoActual > 0) {
          insights.push({
            type: 'warning', icon: 'shield',
            title: `Fondo de emergencia: ${mesesCubiertos} meses de gastos`,
            body: `Tu saldo actual ($${fmt(saldoActual)}) cubre menos de 1 mes de gastos. Se recomienda tener al menos 3 meses como colchón financiero.`,
          });
        } else if (mesesCubiertos >= 3) {
          insights.push({
            type: 'positive', icon: 'shield',
            title: `Fondo de emergencia saludable: ${mesesCubiertos} meses`,
            body: `Tu saldo cubre ${mesesCubiertos} meses de gastos. Superas el mínimo recomendado de 3 meses. Considera un depósito a plazo para rentabilizar ese excedente.`,
          });
        }
      }

      // ── Financial alert notifications (fire-and-forget, max 1/day/user) ─
      const alertKey = `alerts:${userId}:${new Date().toISOString().slice(0, 10)}`;
      if (!financialAlertsSent.has(alertKey) && ingresos > 0) {
        financialAlertsSent.add(alertKey);

        // Alert: savings rate below 20%
        if (tasaAhorro < 20 && tasaAhorro >= 0) {
          const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          storage.createNotification({
            userId,
            title: `Tu tasa de ahorro bajó al ${tasaAhorro}%`,
            message: `Tu tasa de ahorro actual (${tasaAhorro}%) está por debajo del 20% recomendado. Tus egresos suman $${fmt(totalEgresos)} vs ingresos de $${fmt(ingresos)}.`,
            type: tasaAhorro < 5 ? "warning" : "info",
            category: "expense",
          }).catch(() => {});
        }

        // Alert: category spike (any category > 40% of total spending)
        for (const cat of spendingByCategory) {
          if (cat.pct >= 40) {
            const catLabels: Record<string, string> = { alimentacion: 'Alimentación', transporte: 'Transporte', entretenimiento: 'Entretenimiento', telecomunicaciones: 'Telecomunicaciones', transferencia_enviada: 'Transferencias', comercio: 'Comercio', educacion: 'Educación', salud: 'Salud', otro: 'Otros' };
            storage.createNotification({
              userId,
              title: `Alerta: ${catLabels[cat.categoria] ?? cat.categoria} al ${cat.pct}% de tus gastos`,
              message: `La categoría ${catLabels[cat.categoria] ?? cat.categoria} concentra el ${cat.pct}% de tus egresos totales. Revisa si hay gastos que puedas optimizar.`,
              type: "warning",
              category: "expense",
              actionUrl: `/movimientos?categoria=${encodeURIComponent(cat.categoria)}`,
            }).catch(() => {});
            break; // Only alert for the top offender
          }
        }
      }

      res.json({ spendingByCategory, insights, totalEgresos, totalIngresos: ingresos });
    } catch (e) {
      logger.error({ err: e }, "Failed to compute transaction insights");
      res.status(500).json({ message: "Error al calcular insights." });
    }
  });

  // GET /api/financial-health — decision tree evaluation + government programs eligibility
  app.get("/api/financial-health", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
      if (cartolas.length === 0) {
        return res.json({ hasData: false, healthLevel: null, programs: [], savingsTips: [] });
      }

      // Excluir transferencias internas (pago de tarjeta, divisas) para que NO
      // inflen el ingreso ni la tasa de ahorro — mismo predicado que el resto.
      const { isInternalTransferTx } = await import('./services/assistantContext.js');
      interface RawTx { fecha: string; cargo: number; abono: number; descripcion?: string; categoria?: string }
      let totalIncome = 0, totalExpenses = 0, hasEduExpenses = false, eduTotal = 0;

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: (RawTx & { tipo?: string; monto?: number; es_transferencia?: boolean })[] } | null;
        for (const t of pd?.transacciones ?? []) {
          if (isInternalTransferTx(t as any)) continue;
          if ('tipo' in t && t.tipo === 'abono' && typeof t.monto === 'number') {
            totalIncome += t.monto;
          } else if ('tipo' in t && t.tipo === 'cargo' && typeof t.monto === 'number') {
            totalExpenses += t.monto;
            if (t.categoria === 'educacion') { hasEduExpenses = true; eduTotal += t.monto; }
          } else {
            totalIncome += t.abono ?? 0;
            const cargo = t.cargo ?? 0;
            totalExpenses += cargo;
          }
        }
      }

      const latestCartola = cartolas[0] as any;
      const saldoActual: number = (latestCartola?.parsedData as any)?.saldoFinal ?? 0;
      const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;
      const mesesCubiertos = totalExpenses > 0 ? saldoActual / totalExpenses : 0;
      const eduPct = totalIncome > 0 ? Math.round((eduTotal / totalIncome) * 100) : 0;

      const credit = await storage.getCreditScore(userId);
      const txScore = await storage.getTransactionalScore(userId);

      const result = evaluateGovernmentPrograms({
        monthlyIncome: totalIncome,
        monthlyExpenses: totalExpenses,
        savingsRate,
        saldoActual,
        creditScore: credit?.score ?? null,
        transactionalScore: txScore?.transactionalScore ?? null,
        hasEducationExpenses: hasEduExpenses,
        educationExpensesPct: eduPct,
        hasMortgage: false,
        age: null,
        mesesCubiertos,
      });

      res.json({ hasData: true, ...result });
    } catch (e) {
      logger.error({ err: e }, "Failed to evaluate financial health");
      res.status(500).json({ message: "Error al evaluar salud financiera." });
    }
  });

  // DELETE /api/user/cartolas — elimina todas las cartolas del usuario (permite empezar desde cero)
  app.delete("/api/user/cartolas", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const deleted = await storage.deleteDocumentUploadsByType(userId, "cartola");
      logger.info({ userId, deleted }, "Cartolas deleted by user");
      res.json({ deleted, message: `${deleted} cartola(s) eliminada(s).` });
    } catch (e) {
      logger.error({ err: e }, "Failed to delete cartolas");
      res.status(500).json({ message: "Error al eliminar cartolas." });
    }
  });

  // GET /api/user/documents — list all document uploads for the authenticated user (metadata only, no parsedData)
  app.get("/api/user/documents", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }
      const docs = await storage.listAllDocumentUploads(userId);
      // Enriquecer cada cartola con la cantidad de movimientos derivados, resolviendo
      // el score_document_upload por el link explícito (con fallback legacy).
      const { findRelatedScoreDocsForDocumentUpload } = await import("./services/documents/documentUploadLinks.js");
      const { countTransactionsForDocument } = await import("./services/documents/normalizeCartola.js");
      const scoreDocs = await storage.listScoreDocumentUploadsByType(userId, "cartola");
      const enriched = await Promise.all(
        docs.map(async (doc: { id: string }) => {
          const related = findRelatedScoreDocsForDocumentUpload(doc, scoreDocs);
          const counts = await Promise.all(related.docs.map((s: { id: string }) => countTransactionsForDocument(s.id)));
          return { ...doc, movementCount: counts.reduce((a, b) => a + b, 0) };
        }),
      );
      res.json({ documents: enriched, count: enriched.length });
    } catch (e) {
      logger.error({ err: e }, "Failed to list user documents");
      res.status(500).json({ message: "Error al obtener documentos." });
    }
  });

  // DELETE /api/user/documents/:id — elimina UN documento (cartola/CMF) del usuario,
  // para poder borrar y re-subir. Dueño-único (otro usuario → 404).
  app.delete("/api/user/documents/:id", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const docId = req.params.id;
      const docs = await storage.listAllDocumentUploads(userId);
      const doc = docs.find((d: { id: string }) => d.id === docId);
      if (!doc) return res.status(404).json({ message: "Documento no encontrado." });

      // Cascada vía el link explícito source_document_upload_id (con fallback legacy
      // por banco+período): borra el/los score doc(s) y SUS transacciones normalizadas.
      const { deleteRelatedScoreDocsForDocumentUpload } = await import("./services/documents/documentUploadLinks.js");
      const cascade = await deleteRelatedScoreDocsForDocumentUpload(userId, doc);
      await storage.deleteDocumentUploadById(docId, userId);
      logger.info({ userId, docId, ...cascade }, "Document + derived transactions deleted");
      res.json({ success: true, removedTransactions: cascade.removedTransactions });
    } catch (e) {
      logger.error({ err: e }, "Failed to delete user document");
      res.status(500).json({ message: "Error al eliminar el documento." });
    }
  });

  // GET /api/score-history — line chart data for score evolution
  app.get("/api/score-history", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const history = await storage.getScoreHistory(userId, 100);
      res.json({ history });
    } catch (e) {
      logger.error({ err: e }, "Failed to get score history");
      res.status(500).json({ message: "Error al obtener historial de scores." });
    }
  });

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
      // Save to score history (fire-and-forget)
      if (data.transactionalScore != null) {
        storage.addScoreHistoryEntry(userId, data.transactionalScore, 100, JSON.stringify(data.metrics ?? {})).catch(() => {});
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

  /** Sincroniza ingesta Open Banking (cuentas y movimientos) para el usuario del token. */
  app.post("/api/open-banking/sync", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({
          message: "Usuario no encontrado. Inicia sesión de nuevo o regístrate.",
        });
      }
      const { ingestOpenBankingForUser } = await import("./jobs/ingest.js");
      await ingestOpenBankingForUser(userId);
      res.json({ message: "Sincronización completada" });
    } catch (_e) {
      logger.error({ err: _e }, "Error en sincronización Open Banking");
      res.status(500).json({ message: "Error al sincronizar datos bancarios." });
    }
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

  // Riesgo de seguros a partir del vector de características + PD del usuario autenticado
  app.get("/api/insurance-risk", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      const { buildUserFeatureVector } = await import("./ml/features.js");
      const { scorePD } = await import("./services/pdScoring.js");
      const { computeInsuranceRiskFromFeatures } = await import("./utils/insuranceRisk.js");

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
      logger.error({ err: _e }, "Error computing insurance risk");
      res.status(500).json({ message: "Error al calcular el riesgo de seguros." });
    }
  });

  /**
   * Traza la predicción XGB en `algorithmPredictionLogs` con razones por instancia (no el
   * ranking SHAP global de `getTopFeatures`) — antes este path de scoring no se registraba
   * en absoluto en la trazabilidad algorítmica (NCG 502).
   */
  async function tracePdXgbPrediction(
    userId: string,
    pd: number,
    reasons: Array<{ feature: string; contribution: number; direction: "increases_risk" | "decreases_risk" }>,
    features: Record<string, unknown>,
    startedAt: number
  ) {
    try {
      const { logCreditScorePrediction } = await import("./services/audit/algorithmicTraceability.js");
      const { randomUUID } = await import("node:crypto");
      const creditScore = Math.round(850 - pd * 550);
      const riskCategory = creditScore >= 750 ? "EXCELLENT" : creditScore >= 680 ? "GOOD" : creditScore >= 620 ? "AVERAGE" : creditScore >= 550 ? "POOR" : "VERY_POOR";
      await logCreditScorePrediction(
        userId,
        randomUUID(),
        {
          creditScore,
          probabilityDefault: pd,
          riskCategory,
          confidence: 0.8,
          shapValues: reasons,
          topFactors: reasons,
        },
        { features },
        { processingTimeMs: Date.now() - startedAt }
      );
    } catch (err) {
      logger.warn({ err }, "Failed to persist XGB prediction trace");
    }
  }

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
          const startedAt = Date.now();
          const { PDModelRegistry } = await import("./services/modelRegistry.js");
          const reg = PDModelRegistry.instance();
          if (!reg.isReady) {
            await new Promise((r) => setTimeout(r, 150));
          }
          if (reg.isReady) {
            const pd = await reg.scoreXGB(fv as any);
            const instanceReasons = reg.explainInstance(fv as any, 5);
            const reasons = ["model:xgb", ...instanceReasons.map((r) => r.feature)];
            await tracePdXgbPrediction(userId, pd, instanceReasons, fv as Record<string, unknown>, startedAt);
            return res.json({ pd, reasons, reasonDetail: instanceReasons, features: fv, model: reg.getManifest() });
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

  // PD (probabilidad de impago) para el usuario autenticado
  app.get("/api/scoring/pd", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      const { buildUserFeatureVector } = await import("./ml/features.js");
      const { scorePD } = await import("./services/pdScoring.js");
      const fv = await buildUserFeatureVector(userId, 90);
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const modelParam = String(req.query.model || "baseline");
      if (modelParam.toLowerCase() === "xgb") {
        try {
          const startedAt = Date.now();
          const reg = PDModelRegistry.instance();
          // Allow a short warm-up window for lazy model load
          if (!reg.isReady) {
            await new Promise((r) => setTimeout(r, 150));
          }
          if (reg.isReady) {
            const pd = await reg.scoreXGB(fv as any);
            const instanceReasons = reg.explainInstance(fv as any, 5);
            const reasons = ["model:xgb", ...instanceReasons.map((r) => r.feature)];
            await tracePdXgbPrediction(userId, pd, instanceReasons, fv as Record<string, unknown>, startedAt);
            return res.json({ pd, reasons, reasonDetail: instanceReasons, features: fv, model: reg.getManifest() });
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
      logger.error({ err: _e }, "Error scoring PD");
      res.status(500).json({ message: "Error al calcular el PD." });
    }
  });

  app.get("/api/scoring/features", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      let fv: Record<string, unknown> = {};
      let canBuildFeatures = false;
      try {
        if (db) {
          await db.select().from(accounts).limit(1);
          canBuildFeatures = true;
        }
      } catch {
        canBuildFeatures = false;
      }

      if (canBuildFeatures) {
        try {
          const mod = await import("./ml/features.js");
          if (mod && typeof mod.buildUserFeatureVector === "function") {
            fv = await mod.buildUserFeatureVector(userId, 90);
          } else {
            throw new Error("buildUserFeatureVector no disponible");
          }
        } catch (fvErr) {
          logger.warn({ err: fvErr }, "No se pudo construir el vector de características");
          return res.status(503).json({ message: "No hay datos suficientes para el modelo." });
        }
      } else {
        return res.status(503).json({ message: "Base de datos no disponible para scoring." });
      }
      res.json(fv);
    } catch (_e) {
      logger.error({ err: _e }, "Error computing features");
      res.status(500).json({ message: "Error al calcular características." });
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

  // Explicación SHAP / heurística para el usuario autenticado
  app.get("/api/scoring/pd/explain", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      const top = Math.max(1, Math.min(20, parseInt(String(req.query.top || "5"), 10)));
      let fv: Record<string, unknown> = {};
      let canBuildFeatures = false;
      try {
        if (db) {
          await db.select().from(accounts).limit(1);
          canBuildFeatures = true;
        }
      } catch {
        canBuildFeatures = false;
      }

      if (canBuildFeatures) {
        try {
          const mod = await import("./ml/features.js");
          if (mod && typeof mod.buildUserFeatureVector === "function") {
            fv = await mod.buildUserFeatureVector(userId, 90);
          } else {
            throw new Error("buildUserFeatureVector no disponible");
          }
        } catch (fvErr) {
          logger.warn({ err: fvErr }, "No se pudo construir el vector para explicación PD");
          return res.status(503).json({ message: "No hay datos suficientes para explicar el modelo." });
        }
      } else {
        return res.status(503).json({ message: "Base de datos no disponible para scoring." });
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
      logger.error({ err: _e }, "Error en explicación PD");
      res.status(500).json({ message: "Error al generar la explicación del modelo." });
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
          title: "Gasto registrado",
          message: `Añadiste un gasto de ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(currentAmount)} en ${expenseCategoryLabelEs(String(expense.category))}.`,
          type: "info",
          category: "expense",
          actionUrl: "/gastos",
          metadata: JSON.stringify({ expenseId: expense.id, amount: currentAmount, category: expense.category }),
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
      const paidCount = participants.filter((p: BillSplitParticipant) => p.isPaid).length;
      const totalPaid = participants.reduce((sum: number, p: BillSplitParticipant) => sum + (p.isPaid ? parseFloat(String(p.amountOwed)) : 0), 0);
      
      res.json({
        id: billSplit.id,
        name: billSplit.name,
        description: billSplit.description,
        totalAmount: billSplit.totalAmount,
        date: billSplit.date,
        status: billSplit.status,
        createdByName: creatorName,
        shareCode: billSplit.shareCode,
        participants: participants.map((p: BillSplitParticipant) => ({
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
      let participant = participants.find((p: BillSplitParticipant) => 
        (participantId && p.id === participantId) ||
        (name && p.name.toLowerCase() === name.toLowerCase()) ||
        (email && p.email && p.email.toLowerCase() === email.toLowerCase())
      );
      
      if (!participant) {
        return res.status(404).json({ 
          message: "Participant not found. Please check your name matches exactly.",
          availableNames: participants.filter((p: BillSplitParticipant) => !p.isPaid).map((p: BillSplitParticipant) => p.name)
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
      const allPaid = updatedParticipants.every((p: BillSplitParticipant) => !!p.isPaid);
      
      if (allPaid) {
        await storage.updateBillSplit(billSplit.id as number, { status: 'settled' });
      }
      
      res.json({ 
        message: `¡Pago confirmado! Gracias, ${participant.name}.`,
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
      const participant = participants.find((p: BillSplitParticipant) => p.id === participantId);
      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      // Check if participant is already linked to a user
      if (participant.userId) {
        return res.status(400).json({ message: "This participant is already linked to an account" });
      }
      
      // Check if current user is already a participant in this split
      const existingParticipation = participants.find((p: BillSplitParticipant) => p.userId === userId);
      if (existingParticipation) {
        return res.status(400).json({ message: "You are already a participant in this split" });
      }
      
      // Link the participant to the current user
      const updatedParticipant = await storage.updateBillSplitParticipant(participant.id as number, {
        userId: userId
      });
      
      // Get user info for notification
      const user = await storage.getUser(userId);
      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : "Alguien";
      
      // Notify the bill creator
      try {
        await storage.createNotification({
          userId: billSplit.createdBy,
          type: "bill_split",
          category: "bill_split",
          title: "Alguien se unió a tu dividir cuenta",
          message: `${userName} se unió a "${billSplit.name}" como ${participant.name}.`,
        });
      } catch (err) {
        logger.error({ err }, 'Error sending join notification');
      }
      
      res.json({ 
        message: `Te añadieron como ${participant.name} en este dividir cuenta.`,
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
        // Reuse account by email to avoid unique-email conflicts when token userId changes.
        user = await storage.getUserByEmail(String(possibleEmail));
        if (!user) {
          const userName = String((req as AuthenticatedRequest).user?.name || 'User');
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
      }
      const canonicalUserId = user?.id ? String(user.id) : userId;
      
      // Link existing participant records to this user if they match by email
      if (possibleEmail) {
        const unlinkedParticipants = await storage.getUnlinkedParticipantsByEmail(String(possibleEmail));
        if (unlinkedParticipants && unlinkedParticipants.length > 0) {
          for (const participant of unlinkedParticipants) {
            await storage.updateBillSplitParticipant(participant.id, { userId: canonicalUserId });
          }
        }
      }
      
      // Get bill splits where user is the creator
      const createdBillSplits = await storage.getBillSplits(canonicalUserId);
      
      // Get bill splits where user is a participant
      const participantBillSplits = await storage.getBillSplitsAsParticipant(canonicalUserId);
      
      // Combine and deduplicate (in case user is both creator and participant)
      const allBillSplits = [...createdBillSplits];
      for (const participantSplit of participantBillSplits) {
        if (!createdBillSplits.some(cs => cs.id === participantSplit.id)) {
          allBillSplits.push(participantSplit);
        }
      }
      
      // Fetch participants for each bill split and add user role info (explicit shape for frontend balance calc)
      const billSplitsWithParticipants = await Promise.all(
        allBillSplits.map(async (billSplit) => {
          const participants = await storage.getBillSplitParticipants(billSplit.id as number);
          const createdBy = billSplit.createdBy ?? (billSplit as any).created_by;
          const isCreator = String(createdBy) === canonicalUserId;
          const isParticipant = participants.some((p: BillSplitParticipant) => String(p.userId ?? (p as any).user_id) === canonicalUserId);

          // Solo un participante puede ser "tú": si eres creador, solo el primero (índice 0); si no, el que tenga tu userId
          const participantsWithCurrentUser = participants.map((p: BillSplitParticipant, i: number) => {
            const pUserId = p.userId ?? (p as any).user_id;
            const matchesUserId = String(pUserId) === canonicalUserId;
            const isCurrentUser = isCreator ? matchesUserId && i === 0 : matchesUserId;
            return {
              id: p.id,
              name: p.name,
              email: p.email,
              userId: pUserId,
              amountOwed: typeof p.amountOwed === 'number' ? p.amountOwed : Number(p.amountOwed ?? (p as any).amount_owed ?? 0),
              isPaid: !!p.isPaid,
              amountPaid: typeof p.amountPaid === 'number' ? p.amountPaid : Number(p.amountPaid ?? (p as any).amount_paid ?? 0),
              isCurrentUser,
            };
          });
          return {
            ...billSplit,
            createdBy: createdBy ?? billSplit.createdBy,
            participants: participantsWithCurrentUser,
            userRole: isCreator ? 'creator' : (isParticipant ? 'participant' : 'none')
          };
        })
      );
      // Evitar caché/304 para que el cliente siempre reciba datos frescos y actualice saldos
      res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
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
        const userEmail = String((req as AuthenticatedRequest).user?.email || `${userId}@unknown.com`);
        // Reuse existing email owner first to avoid unique-email violations.
        user = await storage.getUserByEmail(userEmail);
        if (!user) {
          const userName = String((req as AuthenticatedRequest).user?.name || 'User');
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
      }
      
      // Extract participants and optional flags from request body (don't include in bill split data)
      const { participants: participantsFromBody, alsoAddToExpenses, ...billSplitFields } = req.body;
      
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
      if (participantsFromBody && Array.isArray(participantsFromBody)) {
        const creatorName = user ? 
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username :
          (req as AuthenticatedRequest).user?.name || (req as AuthenticatedRequest).user?.name || "Alguien";
        
        for (const participant of participantsFromBody) {
          let participantUserId = null;
          if (participant.isCreator) {
            participantUserId = userId;
          } else if (participant.email) {
            const existingUser = await storage.getUserByEmail(participant.email);
            if (existingUser) participantUserId = existingUser.id;
          }
          if (!participantUserId && participant.userId) participantUserId = participant.userId;
          
          const newParticipant = await storage.createBillSplitParticipant({
            billSplitId: billSplit.id as number,
            name: participant.name || 'Unknown',
            email: participant.email || null,
            userId: participantUserId,
            amountOwed: participant.amountOwed || (billSplit.totalAmount / participantsFromBody.length).toFixed(2),
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
        const allPaid = allParticipants.length > 0 && allParticipants.every((p: BillSplitParticipant) => !!p.isPaid);
        if (allPaid) {
          await storage.updateBillSplit(billSplit.id as number, { status: 'settled' });
          billSplit.status = 'settled';
        }
      }

      // Optionally add this bill split as an expense in the user's expenses list
      // Only add the creator's share (totalAmount / number of participants)
      if (alsoAddToExpenses && billSplit.id) {
        try {
          const totalAmount = typeof billSplit.totalAmount === 'number' ? billSplit.totalAmount : parseFloat(String(billSplit.totalAmount));
          const expenseDate = billSplit.date ? new Date(billSplit.date).toISOString() : new Date().toISOString();
          const category = (billSplit as { category?: string }).category || 'general';
          
          // Calculate creator's share: total amount divided by number of participants
          const allParticipants = await storage.getBillSplitParticipants(billSplit.id as number);
          const participantCount = allParticipants.length || 1;
          const creatorShare = totalAmount / participantCount;
          
          await storage.createExpense({
            userId: billSplit.createdBy ?? userId,
            amount: creatorShare,
            description: billSplit.name || 'Gasto compartido',
            name: billSplit.name || undefined,
            category: category,
            date: expenseDate,
            isRecurring: 0,
            isAutoClassified: 0,
          });
          logger.info({ 
            userId, 
            billSplitId: billSplit.id, 
            name: billSplit.name,
            totalAmount,
            creatorShare,
            participantCount
          }, 'Added bill split to expenses (creator share only)');
        } catch (expenseErr) {
          logger.error({ err: expenseErr, billSplitId: billSplit.id }, 'Failed to add bill split to expenses');
          // Do not fail the bill split creation; expense is optional
        }
      }

      // Return full shape (same as GET) so frontend balance updates immediately
      const participantsList = await storage.getBillSplitParticipants(billSplit.id as number);
      const creatorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : (req as AuthenticatedRequest).user?.name || 'Usuario';
      const createdBy = billSplit.createdBy ?? (billSplit as any).created_by;
      // Solo el creador (índice 0) puede ser "tú" en la respuesta del POST
      const participantsPayload = participantsList.map((p: BillSplitParticipant, i: number) => {
        const pUserId = p.userId ?? (p as any).user_id;
        const matchesUserId = String(pUserId) === userId;
        const isCurrentUser = matchesUserId && i === 0;
        return {
          id: p.id,
          name: p.name,
          email: p.email,
          userId: pUserId,
          amountOwed: typeof p.amountOwed === 'number' ? p.amountOwed : Number(p.amountOwed ?? (p as any).amount_owed ?? 0),
          isPaid: !!p.isPaid,
          amountPaid: typeof p.amountPaid === 'number' ? p.amountPaid : Number(p.amountPaid ?? (p as any).amount_paid ?? 0),
          isCurrentUser,
        };
      });
      const payload = {
        ...billSplit,
        createdBy: createdBy ?? billSplit.createdBy,
        createdByName: creatorName,
        participants: participantsPayload,
        userRole: 'creator' as const,
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
      const targetParticipant = participants.find((p: BillSplitParticipant) => p.id === participantId);
      
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
          const payerName = payerUser
            ? `${payerUser.firstName || ""} ${payerUser.lastName || ""}`.trim() || payerUser.username
            : "Alguien";
          
          await notificationService.createNotification({
            userId: String(billSplit.createdBy),
            title: "Pago recibido",
            message: `${payerName} pagó su parte de "${billSplit.name}".`,
            type: "success",
            category: "bill_split",
            actionUrl: "/dividir-cuenta",
            metadata: JSON.stringify({ billSplitId, participantId, paidAmount: participant.amountPaid }),
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
        const allPaidAfter = participantsAfter.length > 0 && participantsAfter.every((p: BillSplitParticipant) => !!p.isPaid);
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

  // Check if user exists for email invitation (no auth required).
  // userExists is only returned on success (200) — never on 403/404 to prevent email enumeration.
  app.get("/api/bill-splits/:id/check-user/:email", async (req: Request, res: Response) => {
    try {
      const billSplitId = Number(req.params.id);
      const email = decodeURIComponent(req.params.email);

      // Validate the bill split exists and the email is actually invited before revealing anything
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit) {
        return res.status(404).json({ message: "Partida no encontrada" });
      }

      const participants = await storage.getBillSplitParticipants(billSplitId);
      const isInvited = participants.some(
        (p: BillSplitParticipant) => p.email && p.email.toLowerCase() === email.toLowerCase()
      );

      if (!isInvited) {
        return res.status(403).json({ message: "Email not invited to this bill split" });
      }

      // Only reveal userExists once we've confirmed the email is a legitimate invitee
      const user = await storage.getUserByEmail(email);
      res.json({
        userExists: !!user,
        billSplitName: billSplit.name,
        invitedEmail: email,
        billSplitId: billSplitId,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error checking user for invitation');
      res.status(500).json({ message: 'Internal server error' });
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
        String((req as AuthenticatedRequest).user?.name || (req as AuthenticatedRequest).user?.name || "Alguien");
      
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
      const { displayName, firstName, lastName, timezone, language, userMetadata, profilePicture } = req.body;
      
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
        userMetadata,
        ...(typeof profilePicture === "string" ? { profilePicture } : {}),
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
      getUserIdFromAuth(req);
      // Flujo real: reset por correo vía /api/auth/forgot-password (cuando exista). Mientras tanto, guía al usuario.
      res.json({
        message:
          "Para cambiar tu contraseña, cierra sesión y en el inicio de sesión usa «Olvidé mi contraseña». Si no recibes el correo, revisa spam o contacta a soporte.",
      });
    } catch (error) {
      logger.error({ err: error }, 'Password change error');
      res.status(500).json({ message: "Failed to send password change email" });
    }
  });

  app.delete("/api/profile/account", authenticate, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromAuth(req);
      logger.info({ userId }, 'Received request to delete account');

      // Anonimización irreversible (Ley 19.628/21.719) — ver services/privacy/accountAnonymization.ts.
      await anonymizeUser(userId);
      logger.info({ userId }, 'Account anonymization complete');

      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      // Let the central error handler deal with it
      next(error); 
    }
  });

  app.get("/api/profile/mfa-status", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const user = await storage.getUser(userId);
      const enrolled = !!(user && Number((user as { twoFactorEnabled?: number }).twoFactorEnabled ?? 0) === 1);
      res.json({ enrolled, methods: enrolled ? ["totp"] : [] });
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

  // Product recommendation endpoints (authenticated)
  app.get("/api/products/recommendations", authenticate, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(401).json({ message: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
      }
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 5;

      const {
        matchProductsToUser,
        getTopRecommendations,
        explainRecommendation,
        PRODUCT_MATCHING_ENGINE_VERSION,
      } = await import('./services/products/matchingEngine.js');
      const { productCatalog, getProductsByCategory } = await import('./services/products/productCatalog.js');

      // Build user profile from available data
      const creditScore = await storage.getCreditScore(userId);
      const transactionalScoreData = await storage.getTransactionalScore(userId);

      // Extract income/expenses from cartola data for richer matching
      let monthlyIncome: number | undefined;
      let monthlyDebt: number | undefined;
      try {
        const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
        if (cartolas.length > 0) {
          // Excluir transferencias internas para no inflar el ingreso del match.
          const { isInternalTransferTx } = await import('./services/assistantContext.js');
          let totalIncome = 0;
          let totalExpenses = 0;
          let months = new Set<string>();
          for (const c of cartolas) {
            const pd = c.parsedData as { transacciones?: any[] } | null;
            for (const t of pd?.transacciones ?? []) {
              if (isInternalTransferTx(t)) continue;
              const fecha = typeof t.fecha === "string" ? t.fecha.slice(0, 7) : "";
              if (fecha) months.add(fecha);
              if ("tipo" in t && typeof t.monto === "number") {
                if (t.tipo === "abono") totalIncome += t.monto;
                else totalExpenses += t.monto;
              } else {
                totalIncome += t.abono ?? 0;
                totalExpenses += t.cargo ?? 0;
              }
            }
          }
          const numMonths = Math.max(1, months.size);
          monthlyIncome = Math.round(totalIncome / numMonths);
          monthlyDebt = Math.round(totalExpenses / numMonths);
        }
      } catch (e) {
        logger.warn({ err: e }, "Could not extract cartola data for product matching");
      }

      const userProfile = {
        userId,
        creditScore: creditScore?.score,
        transactionalScore: transactionalScoreData?.transactionalScore ?? undefined,
        monthlyIncome,
        monthlyDebt,
      };

      // Get recommendations
      const productsToMatch = category ? getProductsByCategory(category) : productCatalog;
      const recommendations = getTopRecommendations(productsToMatch, userProfile, limit, category);

      // Format response with explanations
      const response = recommendations.map(match => {
        const explanation = explainRecommendation(match);
        return {
          ...match.product,
          matchScore: Math.round(match.matchScore),
          rankingScore: Math.round(match.rankingScore),
          explanation: explanation.title,
          reasons: explanation.reasons,
          warnings: explanation.warnings
        };
      });

      const xf = req.headers["x-forwarded-for"];
      const firstIp = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
      const clientIp =
        firstIp ||
        (typeof req.socket?.remoteAddress === "string" ? req.socket.remoteAddress : null);
      const clientUa =
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
      const reqIdHeader = req.headers["x-request-id"];
      const requestId =
        typeof reqIdHeader === "string" && reqIdHeader.length > 0 ? reqIdHeader : crypto.randomUUID();

      await logProductRecommendationRun({
        userId,
        requestId,
        userProfile: {
          creditScore: userProfile.creditScore,
          transactionalScore: userProfile.transactionalScore,
          matchingEngineVersion: PRODUCT_MATCHING_ENGINE_VERSION,
        },
        category,
        limit,
        results: recommendations.map((match) => {
          const productId = productCatalog.findIndex((p) => p === match.product);
          return {
            productId: productId >= 0 ? productId : 0,
            name: `${match.product.provider} · ${match.product.productName}`,
            matchScore: Math.round(match.matchScore),
            rankingScore: Math.round(match.rankingScore),
          };
        }),
        ipAddress: clientIp,
        userAgent: clientUa,
      });

      logger.info({ userId, category, count: response.length }, 'Product recommendations generated');
      res.json(response);
    } catch (error) {
      logger.error({ error }, 'Failed to generate product recommendations');
      res.status(500).json({ message: 'Failed to generate recommendations' });
    }
  });

  // Track product interaction
  app.post("/api/products/track", authenticate, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(401).json({ message: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
      }
      const { productId, eventType, matchScore, metadata } = req.body;

      if (!productId || !eventType) {
        return res.status(400).json({ message: 'productId and eventType are required' });
      }

      const validEvents = ['view', 'click', 'application', 'approval', 'rejection'];
      if (!validEvents.includes(eventType)) {
        return res.status(400).json({ message: `Invalid eventType. Must be one of: ${validEvents.join(', ')}` });
      }

      const { trackLeadEvent } = await import('./services/products/leadTrackingService.js');

      // Get user scores for tracking
      const creditScore = await storage.getCreditScore(userId);
      const transactionalScoreData = await storage.getTransactionalScore(userId);

      await trackLeadEvent({
        userId,
        productId: Number(productId),
        eventType,
        matchScore: matchScore ? Number(matchScore) : undefined,
        userCreditScore: creditScore?.score,
        userTransactionalScore: transactionalScoreData?.transactionalScore ?? undefined,
        metadata
      });

      const xfTrack = req.headers["x-forwarded-for"];
      const firstIpTrack = typeof xfTrack === "string" ? xfTrack.split(",")[0]?.trim() : "";
      const clientIpTrack =
        firstIpTrack ||
        (typeof req.socket?.remoteAddress === "string" ? req.socket.remoteAddress : null);
      const clientUaTrack =
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
      const reqIdTrackHeader = req.headers["x-request-id"];
      const requestIdTrack =
        typeof reqIdTrackHeader === "string" && reqIdTrackHeader.length > 0
          ? reqIdTrackHeader
          : crypto.randomUUID();

      await logProductInteractionTrace({
        userId,
        requestId: requestIdTrack,
        productId: Number(productId),
        eventType,
        matchScore: matchScore ? Number(matchScore) : undefined,
        userCreditScore: creditScore?.score,
        userTransactionalScore: transactionalScoreData?.transactionalScore ?? undefined,
        metadata,
        ipAddress: clientIpTrack,
        userAgent: clientUaTrack,
      });

      res.json({ success: true, message: 'Event tracked' });
    } catch (error) {
      logger.error({ error }, 'Failed to track product event');
      res.status(500).json({ message: 'Failed to track event' });
    }
  });

  // Apply to a product
  app.post("/api/products/apply", authenticate, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res.status(401).json({ message: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
      }
      const { productId, requestedAmount, term, purpose, additionalInfo } = req.body;

      if (!productId) {
        return res.status(400).json({ message: 'productId is required' });
      }

      const { createProductApplication } = await import('./services/products/leadTrackingService.js');
      const { productCatalog } = await import('./services/products/productCatalog.js');

      // Find product in catalog
      const product = productCatalog.find(p => p.provider + p.productName === productId || productCatalog.indexOf(p) === Number(productId));
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Create application
      const applicationId = await createProductApplication(
        userId,
        Number(productId),
        { requestedAmount, term, purpose, additionalInfo },
        product
      );

      const xfApply = req.headers["x-forwarded-for"];
      const firstIpApply = typeof xfApply === "string" ? xfApply.split(",")[0]?.trim() : "";
      const clientIpApply =
        firstIpApply ||
        (typeof req.socket?.remoteAddress === "string" ? req.socket.remoteAddress : null);
      const clientUaApply =
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
      const reqIdApplyHeader = req.headers["x-request-id"];
      const requestIdApply =
        typeof reqIdApplyHeader === "string" && reqIdApplyHeader.length > 0
          ? reqIdApplyHeader
          : crypto.randomUUID();

      await logProductApplicationTrace({
        userId,
        requestId: requestIdApply,
        productId: Number(productId),
        applicationId,
        payload: {
          requestedAmount: requestedAmount ?? null,
          term: term ?? null,
          purpose: purpose ?? null,
          additionalInfo: additionalInfo ?? null,
        },
        ipAddress: clientIpApply,
        userAgent: clientUaApply,
      });

      logger.info({ userId, productId, applicationId }, 'Product application submitted');
      res.json({
        success: true,
        applicationId,
        message: 'Aplicación enviada exitosamente',
        estimatedProcessingDays: product.avgProcessingDays ?? 5
      });
    } catch (error) {
      logger.error({ error }, 'Failed to submit product application');
      res.status(500).json({ message: 'Failed to submit application' });
    }
  });

  // Get user's applications
  app.get("/api/products/applications", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { getUserApplications } = await import('./services/products/leadTrackingService.js');

      const applications = await getUserApplications(userId);

      res.json(applications);
    } catch (error) {
      logger.error({ error }, 'Failed to get user applications');
      res.status(500).json({ message: 'Failed to retrieve applications' });
    }
  });

  // Get product metrics (admin only - for now, authenticated users)
  app.get("/api/products/metrics", authenticate, async (req: Request, res: Response) => {
    try {
      const { getTotalRevenueMetrics, getOverallFunnelMetrics } = await import('./services/products/leadTrackingService.js');

      const [revenueMetrics, funnelMetrics] = await Promise.all([
        getTotalRevenueMetrics(),
        getOverallFunnelMetrics()
      ]);

      res.json({
        revenue: revenueMetrics,
        funnel: funnelMetrics
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get product metrics');
      res.status(500).json({ message: 'Failed to retrieve metrics' });
    }
  });

  // Get funnel metrics for a specific product
  app.get("/api/products/:id/metrics", authenticate, async (req: Request, res: Response) => {
    try {
      const productId = Number(req.params.id);
      const { getProductFunnelMetrics } = await import('./services/products/leadTrackingService.js');

      const metrics = await getProductFunnelMetrics(productId);

      res.json(metrics);
    } catch (error) {
      logger.error({ error }, 'Failed to get product funnel metrics');
      res.status(500).json({ message: 'Failed to retrieve product metrics' });
    }
  });

  // Utility endpoints (public, no auth) — sin estado de usuario, así que se acotan
  // con publicLimiter (más estricto que apiLimiter) y se valida la forma/tamaño
  // del body para que no sean un vector de abuso barato.
  const utilsBankDataSchema = z.object({
    bankData: z.array(z.record(z.unknown())).min(1).max(50),
  });
  const utilsInsuranceRiskSchema = z.object({
    bankData: z.array(z.record(z.unknown())).min(1).max(50),
    userProfile: z.record(z.unknown()),
  });

  app.post("/api/utils/credit-score", publicLimiter, validateBody(utilsBankDataSchema), async (req: Request, res: Response) => {
    const { bankData } = req.body;
    const { calculateCreditScore } = await import("./utils/creditScore.js");
    const score = calculateCreditScore(bankData);
    res.json(score);
  });

  app.post("/api/utils/insurance-risk", publicLimiter, validateBody(utilsInsuranceRiskSchema), async (req: Request, res: Response) => {
    const { bankData, userProfile } = req.body;
    const { calculateInsuranceRisk } = await import("./utils/insuranceRisk.js");
    const risk = calculateInsuranceRisk(bankData, userProfile);
    res.json(risk);
  });

  // =====================================================
  // EXPENSE AUTOMATION ENDPOINTS
  // =====================================================

  // Parse bank push notification → structured expense
  app.post("/api/expenses/parse-notification", authenticate, async (req: Request, res: Response) => {
    try {
      const { notifications } = req.body;
      const { parseNotifications } = await import('./services/expenses/notificationParser.js');

      if (!notifications || !Array.isArray(notifications)) {
        return res.status(400).json({ success: false, message: 'Se requiere un array "notifications"' });
      }

      const results = parseNotifications(notifications);
      res.json({ results });
    } catch (error) {
      logger.error({ error }, 'Failed to parse notification');
      res.status(500).json({ success: false, message: 'Error al procesar la notificación' });
    }
  });

  // Upload cartola PDF → structured JSON with movements
  app.post("/api/expenses/parse-cartola", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { documentUpload } = await import('./middleware/uploadMiddleware.js');

      documentUpload.single('file')(req, res, async (err: any) => {
        if (err) {
          return res.status(400).json({ success: false, message: err.message });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ success: false, message: 'Se requiere un archivo PDF' });
        }

        const paymentMethod = req.body?.paymentMethod || 'debito';

        const { parseCartolaPdfToJson } = await import('./services/expenses/cartolaParser.js');
        const result = await parseCartolaPdfToJson(file.buffer, paymentMethod);

        if (!result.success) {
          return res.status(422).json({
            success: false,
            message: 'No se pudieron extraer movimientos de la cartola',
          });
        }

        // Auto-reconcile abonos against pending splits
        const { reconcileCartolaMovements } = await import('./services/expenses/reconciliationService.js');
        const reconciliation = await reconcileCartolaMovements(userId, result.movimientos);

        // Map movements: cargos get negative amount, abonos positive
        const movements = result.movimientos.map((m: any) => ({
          ...m,
          amount: m.cargo > 0 ? -m.cargo : m.abono,
          merchant: m.merchantName,
        }));

        res.json({
          success: true,
          movements,
          summary: {
            transactionCount: result.resumen.cantidadMovimientos,
            totalIncome: result.resumen.totalAbonos,
            totalExpenses: result.resumen.totalCargos,
            balance: result.resumen.totalAbonos - result.resumen.totalCargos,
            saldoInicial: result.resumen.saldoInicial,
            saldoFinal: result.resumen.saldoFinal,
            categorias: result.resumen.categorias,
          },
          reconciled: reconciliation.matches.map((m: any) => ({
            participantId: m.participantId,
            billSplitId: m.billSplitId,
            amount: m.amount,
          })),
        });
      });
    } catch (error) {
      logger.error({ error }, 'Failed to parse cartola');
      res.status(500).json({ success: false, message: 'Error al procesar la cartola' });
    }
  });

  // Categorize expense automatically
  app.post("/api/expenses/categorize", authenticate, async (req: Request, res: Response) => {
    try {
      const { merchantName, amount, description } = req.body;
      const { categorizeExpense } = await import('./services/expenses/expenseCategorizer.js');

      const result = categorizeExpense(merchantName || '', amount, description);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error({ error }, 'Failed to categorize expense');
      res.status(500).json({ success: false, message: 'Error al categorizar' });
    }
  });

  // Bulk import movements from cartola as expenses
  app.post("/api/expenses/import-cartola", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { movements, movimientos } = req.body;
      const movs = movements || movimientos;

      if (!movs || !Array.isArray(movs) || movs.length === 0) {
        return res.status(400).json({ success: false, message: 'Se requiere un array de movimientos' });
      }

      // Only import cargos (debits) as expenses
      const cargos = movs.filter((m: any) => m.sfaOperationType === 'cargo' || m.cargo > 0 || (m.amount != null && m.amount < 0));

      let imported = 0;
      for (const mov of cargos) {
        try {
          await storage.createExpense({
            userId,
            name: mov.merchant || mov.merchantName || mov.description,
            amount: Math.abs(mov.amount ?? mov.cargo ?? 0),
            description: mov.description,
            category: mov.category || 'other',
            subcategory: mov.subcategory,
            merchantName: mov.merchant || mov.merchantName,
            date: mov.date || new Date().toISOString(),
            paymentMethod: mov.paymentMethod || 'debito',
            isAutoClassified: 1,
            confidence: mov.confidence || 0.7,
          });
          imported++;
        } catch (err) {
          logger.warn({ err, mov }, 'Failed to import single movement');
        }
      }

      res.json({
        success: true,
        imported,
        skipped: movs.length - cargos.length,
        message: `${imported} gastos importados exitosamente`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to import cartola movements');
      res.status(500).json({ success: false, message: 'Error al importar movimientos' });
    }
  });

  // =====================================================
  // BILL SPLIT PAYMENT LINKS & SHARING
  // =====================================================

  // Generate payment link + WhatsApp message for a bill split
  app.post("/api/bill-splits/:id/payment-link", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const { participantId, transferDetails } = req.body;

      if (!participantId || !transferDetails) {
        return res.status(400).json({ success: false, message: 'Se requiere participantId y transferDetails' });
      }

      // Get bill split
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || billSplit.createdBy !== userId) {
        return res.status(404).json({ success: false, message: 'Gasto compartido no encontrado' });
      }

      // Get participant
      const participants = await storage.getBillSplitParticipants(billSplitId);
      const participant = participants.find((p: any) => p.id === participantId);
      if (!participant) {
        return res.status(404).json({ success: false, message: 'Participante no encontrado' });
      }

      const { createPaymentLink, generateWhatsAppMessage, generateShareData } = await import('./services/expenses/paymentLinkService.js');

      const baseUrl = process.env.WEB_URL || 'https://coda-web-steel.vercel.app';

      const paymentLink = createPaymentLink({
        billSplitId,
        participantId,
        shareCode: billSplit.shareCode || `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
        amount: participant.amountOwed,
        concept: billSplit.name,
        transferDetails,
      });

      const user = await storage.getUser(userId);

      const whatsappMessage = generateWhatsAppMessage({
        amount: participant.amountOwed,
        concept: billSplit.name,
        creatorName: user?.firstName || user?.username || 'Usuario CODA',
        shareCode: billSplit.shareCode || paymentLink.shareCode,
        baseUrl,
        transferDetails: paymentLink.transferDetails,
      });

      const shareData = generateShareData({
        amount: participant.amountOwed,
        concept: billSplit.name,
        creatorName: user?.firstName || user?.username || 'Usuario CODA',
        shareCode: billSplit.shareCode || paymentLink.shareCode,
        baseUrl,
      });

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

      res.json({
        success: true,
        paymentLink,
        whatsappUrl,
        whatsappMessage,
        shareData,
        paymentUrl: `${baseUrl}/split/${billSplit.shareCode || paymentLink.shareCode}`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate payment link');
      res.status(500).json({ success: false, message: 'Error al generar link de pago' });
    }
  });

  // Reconcile a notification with pending splits
  app.post("/api/expenses/reconcile-notification", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ success: false, message: 'Se requiere "text"' });
      }

      const { parseNotification } = await import('./services/expenses/notificationParser.js');
      const notification = parseNotification(text);

      if (!notification) {
        return res.json({ success: true, matches: [], message: 'No se pudo interpretar la notificación' });
      }

      if (notification.operationType !== 'abono') {
        return res.json({ success: true, matches: [], notification, message: 'Solo abonos se reconcilian' });
      }

      const { reconcileNotification } = await import('./services/expenses/reconciliationService.js');
      const matches = await reconcileNotification(userId, notification);

      // Auto-reconcile high-confidence matches
      const { autoReconcileAndNotify } = await import('./services/expenses/reconciliationService.js');
      for (const match of matches) {
        if (match.autoReconciled) {
          await autoReconcileAndNotify(userId, match);
        }
      }

      res.json({
        success: true,
        notification,
        matches,
        reconciled: matches.filter(m => m.autoReconciled).length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to reconcile notification');
      res.status(500).json({ success: false, message: 'Error al reconciliar' });
    }
  });

  registerDocumentParsingAndScoringRoutes(app);
  registerDashboardRoutes(app);

  // ── Admin: retroactive re-categorization of stored transactions ─────────
  app.post("/api/admin/recategorize", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { categorizeTransaction } = await import("./parsers/cartola-parser.js");

      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
      let updated = 0;

      for (const doc of cartolas) {
        const pd = doc.parsedData as { transacciones?: any[] } | null;
        if (!pd?.transacciones?.length) continue;

        let docChanged = false;
        for (const tx of pd.transacciones) {
          if (!tx.descripcion) continue;
          // Support both stored formats:
          // New format: tipo="cargo"|"abono", monto=number
          // Old format: cargo=number, abono=number (legacy)
          const tipo: "cargo" | "abono" = tx.tipo
            ? tx.tipo
            : (tx.abono ?? 0) > 0 ? "abono" : "cargo";
          const monto = tx.monto ?? ((tx.abono ?? 0) > 0 ? tx.abono : (tx.cargo ?? 0));
          const newCat = categorizeTransaction(tx.descripcion, monto, tipo);
          if (tx.categoria !== newCat) {
            tx.categoria = newCat;
            docChanged = true;
            updated++;
          }
        }
        if (docChanged) {
          await storage.updateDocumentUploadParsedData(doc.id, pd);
        }
      }

      res.json({ updated });
    } catch (e) {
      logger.error({ err: e }, "admin/recategorize");
      res.status(500).json({ message: e instanceof Error ? e.message : "Error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
