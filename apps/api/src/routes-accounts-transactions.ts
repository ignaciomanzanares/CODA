import type { Express } from "express";
import { requireTwoFactorForBankLink } from "./routes-onboarding.js";
import { storage } from "./storage.js";
import { insertAccountSchema, insertBankConnectionSchema } from "./db/index.js";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { authenticate } from "./middleware/auth.js";
import crypto from "crypto";

import { logger } from "./logger.js";

import {
  validateBody,
  validateParams,
  idParamSchema,
  createBankConnectionSchema,
  updateBankConnectionSchema,
  batchTransactionsSchema,
  createAccountSchema,
} from "./middleware/validation.js";
import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerAccountsTransactionsRoutes(app: Express): Promise<void> {
  app.get("/api/accounts", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const accts = await storage.getAccounts(userId);

      const body = JSON.stringify(accts);
      const etag = 'W/"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
      res.set({ "Cache-Control": "private, max-age=30, must-revalidate", ETag: etag });
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch && ifNoneMatch === etag) return res.status(304).end();

      res.json(accts);
    } catch (_e) {
      logger.error({ err: _e }, "Error fetching accounts");
      res.status(500).json({ message: "Internal server error" });
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
        return res
          .status(400)
          .json({ message: "Validation error", errors: validationError.details });
      }
      logger.error({ err }, "Error creating account");
      res.status(500).json({ message: "Internal server error" });
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
      const fromDate = from
        ? new Date(String(from))
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() - 90);
            return d;
          })();
      const cap = limit ? Math.min(parseInt(String(limit)), 500) : 200;
      const allTxns: {
        accountId: number;
        accountName?: string;
        accountType?: string;
        id: number;
        postedAt: string;
        description?: string | null;
        amount: number;
        currency?: string | null;
        category?: string | null;
      }[] = [];
      for (const acc of userAccounts) {
        const txs = await storage.getTransactions(acc.id, {
          from: fromDate,
          to: toDate,
          limit: cap,
        });
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
      logger.error({ err: _e }, "Error fetching all transactions");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Transactions routes
  app.get("/api/accounts/:id/transactions", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const accountId = Number(req.params.id);
      const account = await storage.getAccount(accountId);
      if (!account || String(account.userId) !== userId) {
        return res.status(404).json({ message: "Account not found" });
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
      const etag = 'W/"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
      res.set({ "Cache-Control": "private, max-age=10, must-revalidate", ETag: etag });
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch && ifNoneMatch === etag) return res.status(304).end();

      res.json(txs);
    } catch (_e) {
      logger.error({ err: _e }, "Error fetching transactions");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/transactions/batch",
    authenticate,
    validateBody(batchTransactionsSchema),
    async (req, res) => {
      try {
        // Expect body: { accountId, transactions: InsertTransaction[] }
        const userId = getUserIdFromAuth(req);
        const { transactions } = req.body;
        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
          return res.status(400).json({ message: "transactions[] are required" });
        }
        const accountId = Number(transactions[0].accountId);
        const account = await storage.getAccount(accountId);
        if (!account || String(account.userId) !== userId) {
          return res.status(404).json({ message: "Account not found" });
        }

        // Coerce postedAt to Date
        const normalized = transactions.map((t: any) => ({
          ...t,
          accountId: Number(accountId),
          postedAt: typeof t.postedAt === "string" ? new Date(t.postedAt) : t.postedAt,
        }));

        const created = await storage.createTransactionsBulk(normalized);
        res.status(201).json({ count: created.length });
      } catch (_e) {
        logger.error({ err: _e }, "Error creating transactions batch");
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Hook de corrección de categoría (#31): el usuario reclasifica un movimiento → se guarda la
  // corrección y alimenta el clasificador incremental (fallback a reglas regex).
  app.post("/api/transactions/category-correction", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { text, correctedCategory, originalCategory } = req.body || {};
      if (
        typeof text !== "string" ||
        !text.trim() ||
        typeof correctedCategory !== "string" ||
        !correctedCategory.trim()
      ) {
        return res.status(400).json({ message: "Se requieren 'text' y 'correctedCategory'." });
      }
      const { recordCategoryCorrection } =
        await import("./services/documents/categoryCorrections.js");
      const result = await recordCategoryCorrection({
        userId,
        text,
        correctedCategory,
        originalCategory: typeof originalCategory === "string" ? originalCategory : null,
      });
      if (!result.ok) {
        return res
          .status(400)
          .json({ message: "Texto no válido para aprender (vacío tras normalizar)." });
      }
      return res.status(201).json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "Error registrando corrección de categoría");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bank connection routes
  app.get("/api/bank-connections", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req); // userId is string
      const connections = await storage.getBankConnections(userId);

      // Set appropriate caching headers with a stable ETag based on content
      const body = JSON.stringify(connections);
      const etag = 'W/"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
      res.set({
        "Cache-Control": "private, max-age=30, must-revalidate",
        ETag: etag,
      });

      // Handle conditional request
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }

      res.json(connections);
    } catch (error) {
      logger.error({ err: error }, "Error in bank connections");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/bank-connections",
    authenticate,
    validateBody(createBankConnectionSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      // Onboarding: el 2FA es obligatorio antes de vincular un banco (no-op si el
      // flag ENABLE_ONBOARDING está apagado → no cambia el flujo actual).
      const guard = await requireTwoFactorForBankLink(userId);
      if (!guard.ok) return res.status(409).json({ message: guard.message, requires2FA: true });
      const connectionData = insertBankConnectionSchema.parse({
        ...req.body,
        userId,
      });
      const connection = await storage.createBankConnection(connectionData);
      res.status(201).json(connection);
    },
  );

  app.put(
    "/api/bank-connections/:id",
    authenticate,
    validateParams(idParamSchema),
    validateBody(updateBankConnectionSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      const connectionId = Number(req.params.id);
      const connection = await storage.getBankConnection(connectionId);
      if (!connection || String(connection.userId) !== userId) {
        return res.status(404).json({ message: "Bank connection not found" });
      }
      const updatedConnection = await storage.updateBankConnection(connectionId, req.body);
      res.json(updatedConnection);
    },
  );

  app.delete(
    "/api/bank-connections/:id",
    authenticate,
    validateParams(idParamSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      const connectionId = Number(req.params.id);
      const connection = await storage.getBankConnection(connectionId);
      if (!connection || String(connection.userId) !== userId) {
        return res.status(404).json({ message: "Bank connection not found" });
      }
      await storage.deleteBankConnection(connectionId);
      res.json({ message: "Bank connection deleted" });
    },
  );

  // Financial goals routes
}
