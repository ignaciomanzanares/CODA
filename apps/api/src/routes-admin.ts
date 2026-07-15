import type { Express, Request, Response } from "express";

import { z } from "zod";
import { authenticate, requireAdmin } from "./middleware/auth.js";
import { publicLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./logger.js";

import { validateBody } from "./middleware/validation.js";
import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerAdminRoutes(app: Express): Promise<void> {
  app.get("/api/admin/leads", authenticate, requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(
        500,
        Math.max(1, parseInt(String(req.query.limit ?? "200"), 10) || 200),
      );
      const { getAllLeads } = await import("./services/institutions/institutionLeads.js");
      const leads = await getAllLeads(limit);
      res.json({ count: leads.length, leads });
    } catch (error) {
      logger.error({ error }, "Failed to list admin leads");
      res.status(500).json({ message: "Error al listar leads" });
    }
  });

  // Fase G: outcomes reales de decisiones de crédito — cuánta data etiquetada hay para reentrenar
  // y tasa de aprobación por proveedor ("quién otorga a quién").
  app.get(
    "/api/admin/risk-outcomes",
    authenticate,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const { getDecisionOutcomeStats } = await import("./services/risk/decisionOutcomes.js");
        res.json(await getDecisionOutcomeStats());
      } catch (error) {
        logger.error({ error }, "Failed to get risk outcomes");
        res.status(500).json({ message: "Error al obtener outcomes de riesgo" });
      }
    },
  );

  // Avanza manualmente el estado de un lead (mientras la institución no integre la API).
  app.post(
    "/api/admin/leads/:id/status",
    authenticate,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const leadId = Number(req.params.id);
        if (!Number.isInteger(leadId) || leadId <= 0) {
          return res.status(400).json({ message: "leadId inválido" });
        }
        const { status, originatedAmount, externalApplicationId } = (req.body ?? {}) as {
          status?: "accepted" | "rejected" | "originated";
          originatedAmount?: number;
          externalApplicationId?: string;
        };
        const valid = ["accepted", "rejected", "originated"];
        if (!status || !valid.includes(status)) {
          return res.status(400).json({ message: `status debe ser uno de: ${valid.join(", ")}` });
        }
        if (
          status === "originated" &&
          (typeof originatedAmount !== "number" || originatedAmount <= 0)
        ) {
          return res.status(400).json({ message: "originated requiere originatedAmount > 0" });
        }
        const { adminSetLeadStatus } = await import("./services/institutions/institutionLeads.js");
        const ok = await adminSetLeadStatus(
          leadId,
          status,
          originatedAmount,
          externalApplicationId,
        );
        if (!ok) return res.status(404).json({ message: "Lead no encontrado" });
        res.json({ ok: true, leadId, status });
      } catch (error) {
        logger.error({ error }, "Failed to set admin lead status");
        res.status(500).json({ message: "Error al actualizar el lead" });
      }
    },
  );

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

  app.post(
    "/api/utils/credit-score",
    publicLimiter,
    validateBody(utilsBankDataSchema),
    async (req: Request, res: Response) => {
      const { bankData } = req.body;
      const { calculateCreditScore } = await import("./utils/creditScore.js");
      const score = calculateCreditScore(bankData);
      res.json(score);
    },
  );

  app.post(
    "/api/utils/insurance-risk",
    publicLimiter,
    validateBody(utilsInsuranceRiskSchema),
    async (req: Request, res: Response) => {
      const { bankData, userProfile } = req.body;
      const { calculateInsuranceRisk } = await import("./utils/insuranceRisk.js");
      const risk = calculateInsuranceRisk(bankData, userProfile);
      res.json(risk);
    },
  );
}

export async function registerAdminRecategorizeRoutes(app: Express): Promise<void> {
  // ── Admin: retroactive re-categorization of stored transactions ─────────
  app.post("/api/admin/recategorize", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { recategorizeUserTransactions } =
        await import("./services/recategorizeTransactions.js");
      // force solo si se pide explícitamente (no lo envía el botón normal): NO pisa
      // correcciones manuales por defecto.
      const force = (req.body as { force?: boolean } | undefined)?.force === true;
      const result = await recategorizeUserTransactions(userId, { force });
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "admin/recategorize");
      res.status(500).json({ message: e instanceof Error ? e.message : "Error" });
    }
  });
}
