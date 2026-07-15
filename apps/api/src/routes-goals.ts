import type { Express } from "express";
import { storage } from "./storage.js";

import { z } from "zod";
import { authenticate, ensureUserForToken, type AuthenticatedRequest } from "./middleware/auth.js";
import crypto from "crypto";
import { notificationService } from "./services/notificationService.js";

import { logger } from "./logger.js";

import {
  validateBody,
  validateParams,
  idParamSchema,
  createFinancialGoalSchema,
  updateFinancialGoalSchema,
} from "./middleware/validation.js";
import { rowFromCreateGoalBody } from "./routes-shared.js";

export async function registerGoalsRoutes(app: Express): Promise<void> {
  app.get("/api/financial-goals", authenticate, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = await ensureUserForToken(authReq.user!);
    if (!userId) {
      return res.status(401).json({ message: "Sesión inválida. Cierra sesión y vuelve a entrar." });
    }
    const goals = await storage.getFinancialGoals(userId);

    const body = JSON.stringify(goals);
    const etag = 'W/"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
    res.set({
      "Cache-Control": "private, max-age=30, must-revalidate",
      ETag: etag,
    });
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.json(goals);
  });

  app.post(
    "/api/financial-goals",
    authenticate,
    validateBody(createFinancialGoalSchema),
    async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) {
          return res.status(401).json({
            message:
              "No pudimos sincronizar tu cuenta con la base de datos. Cierra sesión y vuelve a entrar.",
          });
        }

        const goal = await storage.createFinancialGoal(
          rowFromCreateGoalBody(userId, req.body as z.infer<typeof createFinancialGoalSchema>),
        );
        // Emit a creation notification (non-blocking)
        try {
          await notificationService.notifyGoalCreated(userId, goal.name, goal.id as number);
        } catch (notificationError) {
          logger.error({ err: notificationError }, "Error creating goal notification");
        }
        res.status(201).json(goal);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        console.error("[GOALS ERROR]", error);
        logger.error({ err: error, pgCode: e?.code }, "financial-goals POST failed");
        // 42P01 = relation does not exist (tabla financial_goals no creada en Postgres)
        if (e?.code === "42P01" && String(e?.message ?? "").includes("financial_goals")) {
          logger.warn(
            "financial_goals table missing: run `npm run db:migrate` or psql -f migrations/013_financial_goals.sql",
          );
          return res.status(503).json({
            message: "No pudimos guardar la meta. Intenta de nuevo en unos minutos.",
          });
        }
        return res.status(500).json({
          message: "No pudimos guardar la meta. Intenta de nuevo.",
        });
      }
    },
  );

  app.put(
    "/api/financial-goals/:id",
    authenticate,
    validateParams(idParamSchema),
    validateBody(updateFinancialGoalSchema),
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Sesión inválida. Cierra sesión y vuelve a entrar." });
      }
      const goalId = Number(req.params.id);
      const goal = await storage.getFinancialGoal(goalId);
      if (!goal || String(goal.userId) !== userId) {
        return res.status(404).json({ message: "Financial goal not found" });
      }
      const updateData = req.body.targetDate
        ? {
            ...req.body,
            targetDate:
              typeof req.body.targetDate === "string"
                ? req.body.targetDate
                : new Date(req.body.targetDate).toISOString(), // Keep as ISO string for SQLite
          }
        : req.body;
      const updatedGoal = await storage.updateFinancialGoal(goalId, updateData);

      // Check for goal milestone notifications
      if (updatedGoal && req.body.currentAmount !== undefined) {
        try {
          const progress = Math.round((updatedGoal.currentAmount / updatedGoal.targetAmount) * 100);

          // Notify on significant milestones (25%, 50%, 75%, 90%, 100%)
          const milestones = [25, 50, 75, 90, 100];
          const currentMilestone = milestones.find(
            (m) => progress >= m && (goal.currentAmount / goal.targetAmount) * 100 < m,
          );

          if (currentMilestone) {
            await notificationService.notifyGoalMilestone(
              userId,
              updatedGoal.name,
              currentMilestone,
              updatedGoal.id as number,
            );
          }
        } catch (notificationError) {
          logger.error({ err: notificationError }, "Error creating goal milestone notification");
        }
      }

      res.json(updatedGoal);
    },
  );

  app.delete(
    "/api/financial-goals/:id",
    authenticate,
    validateParams(idParamSchema),
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Sesión inválida. Cierra sesión y vuelve a entrar." });
      }
      const goalId = Number(req.params.id);
      const goal = await storage.getFinancialGoal(goalId);
      if (!goal || String(goal.userId) !== userId) {
        return res.status(404).json({ message: "Financial goal not found" });
      }
      await storage.deleteFinancialGoal(goalId);
      res.json({ message: "Financial goal deleted" });
    },
  );

  // Notification routes
}
