import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";

import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import crypto from "crypto";
import { notificationService, expenseCategoryLabelEs } from "./services/notificationService.js";

import multer from "multer";
import { logger } from "./logger.js";

import {
  validateBody,
  validateParams,
  idParamSchema,
  createExpenseSchema,
  updateExpenseSchema,
} from "./middleware/validation.js";
import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerExpensesRoutes(app: Express): Promise<void> {
  app.get("/api/expenses", authenticate, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenses = await storage.getExpenses(userId);

    const body = JSON.stringify(expenses);
    const etag = 'W/"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
    res.set({
      "Cache-Control": "private, max-age=30, must-revalidate",
      ETag: etag,
    });
    const ifNoneMatch = req.headers["if-none-match"];
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
      const userEmail = String(
        (req as AuthenticatedRequest).user?.email || `${userId}@unknown.com`,
      );
      const userName = String((req as AuthenticatedRequest).user?.name || userId);
      const [firstName, ...lastNameParts] = userName.split(" ");

      user = await storage.createUser({
        id: userId,
        username: userName,
        email: userEmail,
        passwordHash: "jwt-auth",
        firstName: firstName || "User",
        lastName: lastNameParts.length > 0 ? lastNameParts.join(" ") : null,
      });
      logger.info({ userId, email: userEmail }, "Created new user for expense");
    }

    let expenseData = {
      ...req.body,
      userId,
      // Keep date as ISO string for SQLite
      date:
        typeof req.body.date === "string" ? req.body.date : new Date(req.body.date).toISOString(),
    };

    // Use AI classification if auto-classify is enabled
    if (req.body.isAutoClassified) {
      try {
        const { classifyExpenseWithAI } = await import("./utils/expenseClassifier.js");
        const classification = await classifyExpenseWithAI(
          req.body.description,
          req.body.merchantName,
          typeof req.body.amount === "string" ? parseFloat(req.body.amount) : req.body.amount,
        );

        // Override category and subcategory with AI suggestions if confidence is high enough
        if (classification.confidence >= 0.7) {
          expenseData = {
            ...expenseData,
            category: classification.category,
            subcategory: classification.subcategory || expenseData.subcategory,
            confidence: classification.confidence,
          };
          logger.info(
            {
              originalCategory: req.body.category,
              aiCategory: classification.category,
              confidence: classification.confidence,
            },
            "Applied AI classification to expense",
          );
        }
      } catch (error) {
        logger.error({ err: error }, "Failed to apply AI classification, using original category");
        // Continue with original data if AI classification fails
      }
    }

    const expense = await storage.createExpense(expenseData);

    // Check for unusual spending patterns and create notification
    try {
      logger.debug(
        { userId, amount: expense.amount, category: expense.category },
        "Processing expense notification",
      );

      // For testing: create a notification for any expense >= $50
      const currentAmount = expense.amount;
      if (currentAmount >= 50) {
        logger.debug({ amount: currentAmount }, "Creating expense notification");
        await notificationService.createNotification({
          userId,
          title: "Gasto registrado",
          message: `Añadiste un gasto de ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(currentAmount)} en ${expenseCategoryLabelEs(String(expense.category))}.`,
          type: "info",
          category: "expense",
          actionUrl: "/gastos",
          metadata: JSON.stringify({
            expenseId: expense.id,
            amount: currentAmount,
            category: expense.category,
          }),
        });
        logger.debug("Expense notification created");
      }

      // Original logic for unusual spending (keep this too)
      const userExpenses = await storage.getExpenses(userId);
      const categoryExpenses = userExpenses.filter(
        (e) =>
          e.category === expense.category &&
          e.id !== expense.id && // Exclude current expense
          new Date(e.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      );

      if (categoryExpenses.length > 0) {
        const averageAmount =
          categoryExpenses.reduce((sum, e) => sum + e.amount, 0) / categoryExpenses.length;

        // Notify if this expense is 2x more than average in this category
        if (currentAmount >= averageAmount * 2 && currentAmount >= 100) {
          // Also require minimum $100
          logger.debug({ currentAmount, averageAmount }, "Creating unusual expense notification");
          await notificationService.notifyUnusualExpense(
            userId,
            currentAmount,
            expense.category,
            expense.id as number,
          );
        }
      }
    } catch (notificationError) {
      logger.error({ err: notificationError }, "Error creating expense notification");
    }

    res.status(201).json(expense);
  });

  app.put(
    "/api/expenses/:id",
    authenticate,
    validateParams(idParamSchema),
    validateBody(updateExpenseSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      const expenseId = Number(req.params.id);
      const expense = await storage.getExpense(expenseId);
      if (!expense || String(expense.userId) !== userId) {
        return res.status(404).json({ message: "Expense not found" });
      }
      const updateData = {
        ...req.body,
        // Keep date as ISO string for SQLite
        ...(req.body.date && {
          date:
            typeof req.body.date === "string"
              ? req.body.date
              : new Date(req.body.date).toISOString(),
        }),
      };
      const updatedExpense = await storage.updateExpense(expenseId, updateData);
      res.json(updatedExpense);
    },
  );

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
        typeof amount === "string" ? parseFloat(amount) : amount,
      );

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error classifying expense");
      res.status(500).json({ message: "Failed to classify expense" });
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
          return res
            .status(400)
            .json({ message: "No se recibió ninguna imagen. Usa el campo 'image'." });
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
    },
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
}

export async function registerExpensesAutomationRoutes(app: Express): Promise<void> {
  // =====================================================
  // EXPENSE AUTOMATION ENDPOINTS
  // =====================================================

  // Parse bank push notification → structured expense
  app.post(
    "/api/expenses/parse-notification",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { notifications } = req.body;
        const { parseNotifications } = await import("./services/expenses/notificationParser.js");

        if (!notifications || !Array.isArray(notifications)) {
          return res
            .status(400)
            .json({ success: false, message: 'Se requiere un array "notifications"' });
        }

        const results = parseNotifications(notifications);
        res.json({ results });
      } catch (error) {
        logger.error({ error }, "Failed to parse notification");
        res.status(500).json({ success: false, message: "Error al procesar la notificación" });
      }
    },
  );

  // Upload cartola PDF → structured JSON with movements
  app.post("/api/expenses/parse-cartola", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { documentUpload } = await import("./middleware/uploadMiddleware.js");

      documentUpload.single("file")(req, res, async (err: any) => {
        if (err) {
          return res.status(400).json({ success: false, message: err.message });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ success: false, message: "Se requiere un archivo PDF" });
        }

        const paymentMethod = req.body?.paymentMethod || "debito";

        const { parseCartolaPdfToJson } = await import("./services/expenses/cartolaParser.js");
        const result = await parseCartolaPdfToJson(file.buffer, paymentMethod);

        if (!result.success) {
          return res.status(422).json({
            success: false,
            message: "No se pudieron extraer movimientos de la cartola",
          });
        }

        // Auto-reconcile abonos against pending splits
        const { reconcileCartolaMovements } =
          await import("./services/expenses/reconciliationService.js");
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
      logger.error({ error }, "Failed to parse cartola");
      res.status(500).json({ success: false, message: "Error al procesar la cartola" });
    }
  });

  // Categorize expense automatically
  app.post("/api/expenses/categorize", authenticate, async (req: Request, res: Response) => {
    try {
      const { merchantName, amount, description } = req.body;
      const { categorizeExpense } = await import("./services/expenses/expenseCategorizer.js");

      const result = categorizeExpense(merchantName || "", amount, description);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error({ error }, "Failed to categorize expense");
      res.status(500).json({ success: false, message: "Error al categorizar" });
    }
  });

  // Bulk import movements from cartola as expenses
  app.post("/api/expenses/import-cartola", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { movements, movimientos } = req.body;
      const movs = movements || movimientos;

      if (!movs || !Array.isArray(movs) || movs.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Se requiere un array de movimientos" });
      }

      // Only import cargos (debits) as expenses
      const cargos = movs.filter(
        (m: any) =>
          m.sfaOperationType === "cargo" || m.cargo > 0 || (m.amount != null && m.amount < 0),
      );

      let imported = 0;
      for (const mov of cargos) {
        try {
          await storage.createExpense({
            userId,
            name: mov.merchant || mov.merchantName || mov.description,
            amount: Math.abs(mov.amount ?? mov.cargo ?? 0),
            description: mov.description,
            category: mov.category || "other",
            subcategory: mov.subcategory,
            merchantName: mov.merchant || mov.merchantName,
            date: mov.date || new Date().toISOString(),
            paymentMethod: mov.paymentMethod || "debito",
            isAutoClassified: 1,
            confidence: mov.confidence || 0.7,
          });
          imported++;
        } catch (err) {
          logger.warn({ err, mov }, "Failed to import single movement");
        }
      }

      res.json({
        success: true,
        imported,
        skipped: movs.length - cargos.length,
        message: `${imported} gastos importados exitosamente`,
      });
    } catch (error) {
      logger.error({ error }, "Failed to import cartola movements");
      res.status(500).json({ success: false, message: "Error al importar movimientos" });
    }
  });
}
