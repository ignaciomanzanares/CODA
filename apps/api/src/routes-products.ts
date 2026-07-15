import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";
import { db } from "./db/index.js";
import {
  authenticate,
  ensureUserForToken,
  requireAdmin,
  type AuthenticatedRequest,
} from "./middleware/auth.js";
import crypto from "crypto";

import { logger } from "./logger.js";
import {
  logProductRecommendationRun,
  logProductInteractionTrace,
  logProductApplicationTrace,
} from "./services/audit/traceabilityPersistence.js";

import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerProductsRoutes(app: Express): Promise<void> {
  app.get("/api/financial-products", async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const products = await storage.getFinancialProducts(category);

      const safeProducts = products ?? [];
      const body = JSON.stringify(safeProducts);
      const etag = 'W/"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
      res.set({
        "Cache-Control": "public, max-age=60, must-revalidate",
        ETag: etag,
      });
      const ifNoneMatch = req.headers["if-none-match"];
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
        return res
          .status(401)
          .json({ message: "Sesión inválida. Cierra sesión y vuelve a entrar." });
      }
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 5;

      const {
        matchProductsToUser,
        getTopRecommendations,
        explainRecommendation,
        PRODUCT_MATCHING_ENGINE_VERSION,
      } = await import("./services/products/matchingEngine.js");

      // Build user profile from available data
      const creditScore = await storage.getCreditScore(userId);
      const transactionalScoreData = await storage.getTransactionalScore(userId);

      // Extract income/expenses from cartola data for richer matching
      let monthlyIncome: number | undefined;
      let monthlyDebt: number | undefined;
      try {
        // Fuente de verdad: tabla `transactions`. Excluye internas para no inflar el match.
        const { isInternalTransferTx } = await import("./services/assistantContext.js");
        const { getUserNormalizedTransactions } =
          await import("./services/normalizedTransactions.js");
        const { transactions: txs } = await getUserNormalizedTransactions(userId);
        if (txs.length > 0) {
          let totalIncome = 0;
          let totalExpenses = 0;
          const months = new Set<string>();
          for (const t of txs) {
            if (isInternalTransferTx(t)) continue;
            months.add(t.month);
            totalIncome += t.abono;
            totalExpenses += t.cargo;
          }
          const numMonths = Math.max(1, months.size);
          monthlyIncome = Math.round(totalIncome / numMonths);
          monthlyDebt = Math.round(totalExpenses / numMonths);
        }
      } catch (e) {
        logger.warn({ err: e }, "Could not extract cartola data for product matching");
      }

      // Salud financiera (#25): acopla las recomendaciones a la SITUACIÓN del usuario,
      // no solo a su score. Best-effort: si faltan cartola/CMF, queda undefined y el
      // motor se comporta como antes (solo score + ingresos).
      let financialHealthLevel: number | undefined;
      try {
        const { evaluateUserHealth } = await import("./services/healthEvaluation/index.js");
        const health = await evaluateUserHealth(userId);
        financialHealthLevel = health?.nivel;
      } catch (e) {
        logger.warn({ err: e }, "Could not evaluate financial health for product matching");
      }

      const userProfile = {
        userId,
        creditScore: creditScore?.score,
        transactionalScore: transactionalScoreData?.transactionalScore ?? undefined,
        monthlyIncome,
        monthlyDebt,
        financialHealthLevel,
      };

      // Catálogo único: tabla financial_products (fuente de verdad). Los rows tienen la misma
      // forma que ProductCatalogItem, así que el matchingEngine los consume sin cambios.
      const productsToMatch = await storage.getFinancialProducts(category);
      // Get recommendations, ponderadas por conversión real (#35; neutro si el job no corrió).
      const { getLatestRankingWeights } =
        await import("./services/products/productRankingWeights.js");
      const conversionWeights = await getLatestRankingWeights();
      const recommendations = getTopRecommendations(
        productsToMatch,
        userProfile,
        limit,
        category,
        conversionWeights,
      );

      // Format response with explanations
      const response = recommendations.map((match) => {
        const explanation = explainRecommendation(match);
        return {
          ...match.product,
          matchScore: Math.round(match.matchScore),
          rankingScore: Math.round(match.rankingScore),
          explanation: explanation.title,
          reasons: explanation.reasons,
          warnings: explanation.warnings,
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
        typeof reqIdHeader === "string" && reqIdHeader.length > 0
          ? reqIdHeader
          : crypto.randomUUID();

      await logProductRecommendationRun({
        userId,
        requestId,
        userProfile: {
          creditScore: userProfile.creditScore,
          transactionalScore: userProfile.transactionalScore,
          financialHealthLevel: userProfile.financialHealthLevel,
          matchingEngineVersion: PRODUCT_MATCHING_ENGINE_VERSION,
        },
        category,
        limit,
        results: recommendations.map((match) => {
          // id real de financial_products (el catálogo ahora viene de la DB).
          const productId = Number((match.product as { id?: number }).id) || 0;
          return {
            productId,
            name: `${match.product.provider} · ${match.product.productName}`,
            matchScore: Math.round(match.matchScore),
            rankingScore: Math.round(match.rankingScore),
          };
        }),
        ipAddress: clientIp,
        userAgent: clientUa,
      });

      logger.info(
        { userId, category, count: response.length },
        "Product recommendations generated",
      );
      res.json(response);
    } catch (error) {
      logger.error({ error }, "Failed to generate product recommendations");
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Track product interaction
  app.post("/api/products/track", authenticate, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Sesión inválida. Cierra sesión y vuelve a entrar." });
      }
      const { productId, eventType, matchScore, metadata } = req.body;

      if (!productId || !eventType) {
        return res.status(400).json({ message: "productId and eventType are required" });
      }

      const validEvents = [
        "view",
        "click",
        "apply",
        "convert",
        "application",
        "approval",
        "rejection",
      ];
      if (!validEvents.includes(eventType)) {
        return res
          .status(400)
          .json({ message: `Invalid eventType. Must be one of: ${validEvents.join(", ")}` });
      }

      // Registrar en product_conversion_events para función de pérdida CTR × conversión
      if (["view", "click", "apply", "convert"].includes(eventType)) {
        const { productConversionEvents } = await import("./db/index.js");
        await db.insert(productConversionEvents as any).values({
          id: crypto.randomUUID(),
          userId,
          productId: String(productId),
          eventType,
        });
      }

      const { trackLeadEvent } = await import("./services/products/leadTrackingService.js");

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
        metadata,
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

      res.json({ success: true, message: "Event tracked" });
    } catch (error) {
      logger.error({ error }, "Failed to track product event");
      res.status(500).json({ message: "Failed to track event" });
    }
  });

  // Apply to a product
  app.post("/api/products/apply", authenticate, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Sesión inválida. Cierra sesión y vuelve a entrar." });
      }
      const { productId, requestedAmount, term, purpose, additionalInfo } = req.body;

      if (!productId) {
        return res.status(400).json({ message: "productId is required" });
      }

      const { createProductApplication } =
        await import("./services/products/leadTrackingService.js");

      // Lookup por PK real en financial_products (catálogo único, Fase 1b). El front envía el
      // id numérico de la DB, no un slug — antes el match por provider+productName/indexOf era frágil.
      const numericProductId = Number(productId);
      if (!Number.isInteger(numericProductId) || numericProductId <= 0) {
        return res.status(400).json({ message: "productId inválido" });
      }
      const product = await storage.getFinancialProduct(numericProductId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Create application
      const applicationId = await createProductApplication(
        userId,
        numericProductId,
        { requestedAmount, term, purpose, additionalInfo },
        product,
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

      logger.info({ userId, productId, applicationId }, "Product application submitted");
      res.json({
        success: true,
        applicationId,
        message: "Aplicación enviada exitosamente",
        estimatedProcessingDays: product.avgProcessingDays ?? 5,
      });
    } catch (error) {
      logger.error({ error }, "Failed to submit product application");
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Get user's applications
  app.get("/api/products/applications", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { getUserApplications } = await import("./services/products/leadTrackingService.js");

      const applications = await getUserApplications(userId);

      res.json(applications);
    } catch (error) {
      logger.error({ error }, "Failed to get user applications");
      res.status(500).json({ message: "Failed to retrieve applications" });
    }
  });

  // Get product metrics (admin only - for now, authenticated users)
  app.get(
    "/api/products/metrics",
    authenticate,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { getTotalRevenueMetrics, getOverallFunnelMetrics } =
          await import("./services/products/leadTrackingService.js");

        const [revenueMetrics, funnelMetrics] = await Promise.all([
          getTotalRevenueMetrics(),
          getOverallFunnelMetrics(),
        ]);

        res.json({
          revenue: revenueMetrics,
          funnel: funnelMetrics,
        });
      } catch (error) {
        logger.error({ error }, "Failed to get product metrics");
        res.status(500).json({ message: "Failed to retrieve metrics" });
      }
    },
  );

  // Get funnel metrics for a specific product
  app.get(
    "/api/products/:id/metrics",
    authenticate,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const productId = Number(req.params.id);
        const { getProductFunnelMetrics } =
          await import("./services/products/leadTrackingService.js");

        const metrics = await getProductFunnelMetrics(productId);

        res.json(metrics);
      } catch (error) {
        logger.error({ error }, "Failed to get product funnel metrics");
        res.status(500).json({ message: "Failed to retrieve product metrics" });
      }
    },
  );

  // ── Gestión de leads (back-office admin) ──
  // Lista todos los leads con producto/estado/revenue para el dashboard admin.
}
