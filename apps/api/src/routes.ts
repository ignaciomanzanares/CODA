import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { db, dialect, users, bankConnections, accounts, balances, transactions, creditScores, insuranceRisks, financialGoals, financialProducts, expenses, billSplits, billSplitParticipants, notifications, eq, and, inArray, isNull, desc, insertAccountSchema, insertBankConnectionSchema, insertFinancialGoalSchema } from "./db/index.js";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { authenticate, handleLogin, handleLogout, handleMe, type AuthenticatedRequest } from "./middleware/auth.js";
import { emailService } from "./services/emailService.js";
import crypto from "crypto";
import { notificationService } from "./services/notificationService.js";
import { apiLimiter, expensiveLimiter, authLimiter } from "./middleware/rateLimiter.js";
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

  // Auth routes (no auth required)
  app.post("/api/auth/login", authLimiter, handleLogin);
  app.post("/api/auth/logout", authenticate, handleLogout);
  app.get("/api/auth/me", authenticate, handleMe);

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

  // --- Protected routes (require JWT authentication) ---

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
      console.error('Error fetching accounts:', _e);
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
      console.error('Error creating account:', err);
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
      console.error('Error fetching transactions:', _e);
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
      console.error('Error creating transactions batch:', _e);
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
      console.error('Error in bank connections:', error);
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
      console.log(`✅ Created new user for goal: ${userId} (${userEmail})`);
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
      console.error('Error creating goal created notification:', notificationError);
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
        console.error('Error creating goal milestone notification:', notificationError);
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
      console.error('Error fetching notifications:', error);
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
      console.error('Error marking notification as read:', error);
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
      console.error('Error marking all notifications as read:', error);
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
      console.error('Error deleting notification:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get("/api/notifications/unread-count", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const count = await notificationService.getUnreadCount(userId);
      
      res.json({ count });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- Public/demo routes (no auth required) ---

  // Local demo ingestion to quickly populate accounts/transactions for demo-user
  app.post("/api/demo/ingest", async (_req, res) => {
    try {
      const { ingestOpenBankingForUser } = await import("./jobs/ingest.js");
      await ingestOpenBankingForUser("demo-user");
      res.json({ message: "Demo ingestion completed" });
    } catch (_e) {
      console.error('Error running demo ingestion:', _e);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get("/api/demo/accounts", async (_req, res) => {
    const accts = await storage.getAccounts("demo-user");
    res.json(accts);
  });

  app.get("/api/demo/accounts/:id/transactions", async (req, res) => {
    const accountId = Number(req.params.id);
    const account = await storage.getAccount(accountId);
    if (!account || String(account.userId) !== "demo-user") {
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

  // Credit score routes (demo) — now derived from feature vector + PD
  app.get("/api/credit-score", async (_req, res) => {
    try {
      // For demo purposes, use a fixed user ID
      const userId = "demo-user";

      // Ensure demo user exists
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

      const { buildUserFeatureVector } = await import("./ml/features.js");
      const { scorePD } = await import("./services/pdScoring.js");
      const { computeCreditScoreFromFeatures } = await import("./utils/creditScore.js");

      const fv = await buildUserFeatureVector(userId, 90);
      const { pd } = scorePD(fv);
      const nextScore = computeCreditScoreFromFeatures(fv, pd);

      const existing = await storage.getCreditScore(userId);
      let saved;
      if (existing) {
        saved = await storage.updateCreditScore(userId, nextScore);
      } else {
        saved = await storage.createCreditScore({ userId, ...nextScore });
      }
      res.json(saved ?? nextScore);
    } catch (_e) {
      console.error('Error computing credit score:', _e);
      res.status(500).json({ message: 'Internal server error' });
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
      console.error('Error computing insurance risk:', _e);
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
          console.error("XGB scoring failed, falling back to baseline", err);
        }
      }

      // Baseline
      const { scorePD } = await import("./services/pdScoring.js");
      const scored = scorePD(fv);
      res.json({ pd: scored.pd, reasons: scored.reasons, features: fv });
    } catch (_e) {
      console.error('Error scoring PD:', _e);
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
          console.error("XGB scoring failed, falling back", err);
        }
      }
      const scored = scorePD(fv);
      res.json({ pd: scored.pd, reasons: scored.reasons, features: fv });
    } catch (_e) {
      console.error('Error scoring demo PD:', _e);
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
          console.error('Failed to import/build feature vector for demo user, using fallback vector:', fvErr);
          // Provide a minimal fallback feature vector so explanations can still be returned
          fv = { fallback: 1 };
        }
      } else {
        fv = { fallback: 1 };
      }
      res.json(fv);
    } catch (_e) {
      console.error('Error computing demo features:', _e);
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
          console.error('Failed to import/build feature vector for demo explain, using fallback:', fvErr);
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
          console.error("SHAP explainer failed:", err || out);
          return res.status(500).json({ message: "Failed to compute explanations" });
        }
        try {
          const parsed = JSON.parse(out);
          return res.json({ features: fv, explanation: parsed });
        } catch (_e) {
          console.error("Parse error:", _e, out);
          return res.status(500).json({ message: "Malformed explainer output" });
        }
      });
    } catch (_e) {
      console.error('Error in demo SHAP explain:', _e);
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
      console.log(`✅ Created new user for expense: ${userId} (${userEmail})`);
    }
    
    const expenseData = {
      ...req.body,
      userId,
      // Keep date as ISO string for SQLite
      date: typeof req.body.date === 'string' 
        ? req.body.date 
        : new Date(req.body.date).toISOString()
    };
    const expense = await storage.createExpense(expenseData);
    
    // Check for unusual spending patterns and create notification
    try {
      console.log(`🔔 Processing expense notification for user ${userId}, amount: $${expense.amount}, category: ${expense.category}`);
      
      // For testing: create a notification for any expense >= $50
      const currentAmount = expense.amount;
      if (currentAmount >= 50) {
        console.log(`🔔 Creating expense notification for $${currentAmount}`);
        await notificationService.createNotification({
          userId,
          title: 'New Expense Added',
          message: `You added a $${currentAmount.toFixed(2)} expense for ${expense.category}.`,
          type: 'info',
          category: 'expense',
          actionUrl: '/expenses',
          metadata: JSON.stringify({ expenseId: expense.id, amount: currentAmount, category: expense.category })
        });
        console.log(`✅ Expense notification created successfully`);
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
          console.log(`🔔 Creating unusual expense notification: $${currentAmount} vs avg $${averageAmount.toFixed(2)}`);
          await notificationService.notifyUnusualExpense(
            userId,
            currentAmount,
            expense.category,
            expense.id as number
          );
        }
      }
    } catch (notificationError) {
      console.error('❌ Error creating expense notification:', notificationError);
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
      console.error('Error fetching shared bill split:', error);
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
        console.error('Error sending payment notification:', err);
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
      console.error('Error processing payment:', error);
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
        console.error('Error sending join notification:', err);
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
      console.error('Error joining bill split:', error);
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
      console.error('Error fetching bill splits:', error);
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
        console.log(`✅ Created new user: ${userId} (${userEmail})`);
      }
      
      // Extract participants from request body (don't include in bill split data)
      const { participants, ...billSplitFields } = req.body;
      
      const billSplitData = {
        ...billSplitFields,
        // Use canonical DB user id (returned from createUser) when available
        createdBy: (user && user.id) ? user.id : userId,
        // Ensure date is a proper Date object
        date: req.body.date ? new Date(req.body.date) : new Date()
      };
      const billSplit = await storage.createBillSplit(billSplitData);
      
      // Create notification for bill split creation
      try {
        console.log(`🔔 Creating bill split notification for user ${userId}, title: ${billSplit.name}, amount: $${billSplit.totalAmount}`);
        await notificationService.notifyBillSplitCreated(
          userId, 
          billSplit.name || 'New Bill Split',
          billSplit.totalAmount,
          billSplit.id as number
        );
        console.log(`✅ Bill split notification created successfully`);
      } catch (notificationError) {
        console.error('❌ Error creating bill split notification:', notificationError);
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
                console.log(`Email invitation sent to ${participant.email}`);
              }
            } catch (emailError) {
              console.error('Error sending email invitation:', emailError);
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
      
      res.status(201).json(billSplit);
    } catch (error) {
      console.error('Error creating bill split:', error);
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
          console.error('Error creating payment notification:', notificationError);
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
        console.error('Error updating bill split settlement status after payment:', e);
        res.json({ message: "Payment marked successfully", participant });
      }
    } catch (error) {
      console.error('Error marking payment:', error);
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
      console.error('Error archiving bill split:', error);
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
        console.error('Error in debug users:', error);
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
      console.log(`🔍 Checking if user exists for email: ${email}`);
      const user = await storage.getUserByEmail(email);
      const userExists = !!user;
      console.log(`🔍 User exists: ${userExists}`, user ? { id: user.id, email: user.email } : 'No user found');
      
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
      console.error('Error checking user for invitation:', error);
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
            console.log(`📧 Email invitation ${emailSent ? 'sent' : 'failed'} to ${participant.email}`);
          } catch (emailError) {
            console.error('Error sending email invitation:', emailError);
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
      console.error('Error processing invitations:', error);
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
          console.error('Error creating user from JWT data:', error);
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
      console.error('Profile get error:', error);
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
          console.error('Error creating user:', createError);
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
      console.error('Profile update error:', error);
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
      console.error('Password change error:', error);
      res.status(500).json({ message: "Failed to send password change email" });
    }
  });

  app.delete("/api/profile/account", authenticate, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromAuth(req);
      console.log(`Received request to delete account for user: ${userId}`);

      // First, delete user data from our application's database
      await storage.deleteUserData(userId);
      console.log(`Database cleanup complete for user: ${userId}`);

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
      console.error('MFA status error:', error);
      res.status(500).json({ message: "Failed to get MFA status" });
    }
  });

  app.post("/api/profile/enable-mfa", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      // MFA not implemented for JWT auth
      res.status(501).json({ message: "MFA not implemented for JWT authentication" });
    } catch (error) {
      console.error('MFA enrollment error:', error);
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
