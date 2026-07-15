import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";

import { authenticate } from "./middleware/auth.js";
import crypto from "crypto";

import { logger } from "./logger.js";

import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerAssistantRoutes(app: Express): Promise<void> {
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

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const { chat } = await import("./services/aiService.js");
      const { buildFinancialContextForAssistant } = await import("./services/assistantContext.js");

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
      void import("./services/assistantMemory.js")
        .then(({ updateAssistantSummary }) =>
          updateAssistantSummary(userId, message, response.message),
        )
        .catch(() => {
          /* ya logueado dentro */
        });
    } catch (error) {
      logger.error({ err: error }, "AI Assistant chat error");
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  /**
   * POST /api/assistant/chat/stream
   * SSE streaming chat with the AI financial assistant
   */
  app.post("/api/assistant/chat/stream", authenticate, async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const { getStreamGenerator, parseStructuredResponse } =
        await import("./services/aiService.js");
      const { buildFinancialContextForAssistant } = await import("./services/assistantContext.js");

      const userId = getUserIdFromAuth(req);
      let financialContext: import("./services/aiService.js").FinancialContext = {};
      try {
        financialContext = await buildFinancialContextForAssistant(userId);
      } catch (_e) {
        financialContext = {};
      }

      const result = getStreamGenerator(message, conversationHistory, financialContext, userId);
      if (!result) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(
          `data: ${JSON.stringify({ type: "error", content: "IA no configurada en el servidor." })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
      res.flushHeaders();

      let fullText = "";
      try {
        for await (const event of result.stream) {
          if (typeof event === "string") {
            fullText += event;
            res.write(`data: ${JSON.stringify({ type: "chunk", content: event })}\n\n`);
          } else {
            // Eventos de herramientas (tool_start / tool_end) — la UI los puede
            // usar para mostrar "Consultando tus gastos…" durante la pausa.
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        }

        // Parse the complete response for structured data (suggestions, actionItems)
        const parsed = parseStructuredResponse(fullText);
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            suggestions: parsed.suggestions,
            actionItems: parsed.actionItems,
            provider: result.provider,
            // If model returned JSON, send the clean message (without JSON wrapper)
            message: parsed.message !== fullText ? parsed.message : undefined,
          })}\n\n`,
        );
      } catch (streamError) {
        logger.error({ err: streamError }, "AI stream error");
        res.write(
          `data: ${JSON.stringify({ type: "error", content: "Error en la respuesta del modelo." })}\n\n`,
        );
      }

      res.write("data: [DONE]\n\n");
      res.end();

      // Fire-and-forget: actualizar la memoria del asistente. Solo si la
      // respuesta tiene contenido real (no fue un error a media stream).
      if (fullText.trim().length > 0) {
        void import("./services/assistantMemory.js")
          .then(({ updateAssistantSummary }) => updateAssistantSummary(userId, message, fullText))
          .catch(() => {
            /* ya logueado dentro */
          });
      }
    } catch (error) {
      logger.error({ err: error }, "AI Assistant stream error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process message" });
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
      const { getQuickInsights } = await import("./services/aiService.js");
      const { buildFinancialContextForAssistant } = await import("./services/assistantContext.js");
      const userId = getUserIdFromAuth(req);
      const context = await buildFinancialContextForAssistant(userId);
      const insights = getQuickInsights(context);
      res.json({ insights });
    } catch (error) {
      logger.error({ err: error }, "AI insights error");
      res.status(500).json({ error: "Failed to get insights" });
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

      if (rating !== "up" && rating !== "down") {
        return res.status(400).json({ error: 'rating debe ser "up" o "down"' });
      }
      if (typeof userMessage !== "string" || typeof assistantMessage !== "string") {
        return res.status(400).json({ error: "userMessage y assistantMessage son requeridos" });
      }
      // Truncamos para evitar payloads abusivos en la BD.
      const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

      await storage.createAssistantFeedback({
        userId,
        rating,
        userMessage: trim(userMessage, 2000),
        assistantMessage: trim(assistantMessage, 8000),
        provider: typeof provider === "string" ? provider : undefined,
        comment: typeof comment === "string" ? trim(comment, 1000) : undefined,
      });

      res.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, "Assistant feedback error");
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  /**
   * GET /api/habits/recommendations
   * Hábitos financieros personalizados según la salud financiera del usuario,
   * excluyendo los que el usuario marcó como "no útil" la última vez (feedback loop).
   */
  app.get("/api/habits/recommendations", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { evaluateUserHealth } = await import("./services/healthEvaluation/index.js");
      const { generateHabitRecommendations } = await import("./services/habits/habitEngine.js");

      const health = await evaluateUserHealth(userId);
      if (!health) {
        return res.json({ habits: [], reason: "insufficient_data" });
      }

      const excludedKeys = await storage.getRecentlyDownvotedHabitKeys(userId);
      const habits = generateHabitRecommendations(health, excludedKeys);

      // #34: snapshot del estado financiero al recomendar, para medir efectividad luego.
      try {
        const { logHabitRecommendations } =
          await import("./services/habits/habitRecommendationsLog.js");
        await logHabitRecommendations(userId, habits, health);
      } catch (logErr) {
        logger.warn({ err: logErr, userId }, "No se pudo registrar snapshot de hábitos (no fatal)");
      }

      res.json({ habits });
    } catch (error) {
      logger.error({ err: error }, "Habit recommendations error");
      res.status(500).json({ error: "Failed to get habit recommendations" });
    }
  });

  /**
   * GET /api/habits/progress
   * Efectividad (#34): compara el estado financiero actual contra el snapshot de cuando se
   * recomendó cada hábito, e indica si la métrica objetivo (deuda/ahorro/mora) mejoró.
   */
  app.get("/api/habits/progress", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { evaluateUserHealth } = await import("./services/healthEvaluation/index.js");
      const { getHabitProgress } = await import("./services/habits/habitRecommendationsLog.js");
      const health = await evaluateUserHealth(userId);
      if (!health) return res.json({ progress: [], reason: "insufficient_data" });
      const progress = await getHabitProgress(userId, health);
      res.json({ progress });
    } catch (error) {
      logger.error({ err: error }, "Habit progress error");
      res.status(500).json({ error: "Failed to get habit progress" });
    }
  });

  /**
   * POST /api/habits/feedback
   * Thumbs up/down sobre un hábito recomendado. El rating más reciente por
   * `habitKey` decide si ese hábito sigue mostrándose (ver storage.getRecentlyDownvotedHabitKeys).
   */
  app.post("/api/habits/feedback", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { habitKey, rating } = req.body ?? {};
      const { HABIT_KEYS } = await import("./services/habits/habitCatalog.js");

      if (typeof habitKey !== "string" || !HABIT_KEYS.has(habitKey)) {
        return res.status(400).json({ error: "habitKey inválido" });
      }
      if (rating !== "up" && rating !== "down") {
        return res.status(400).json({ error: 'rating debe ser "up" o "down"' });
      }

      await storage.createHabitFeedback({ userId, habitKey, rating });
      res.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, "Habit feedback error");
      res.status(500).json({ error: "Failed to save habit feedback" });
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

  // Motor de 12 reglas de optimización de deuda (#Fase4): explica al usuario qué acciones
  // concretas mejoran su score crediticio / nivel de salud, agrupadas por familia.
  app.get("/api/debt-rules/recommendations", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { isDebtRulesEnabled, evaluateDebtRules } =
        await import("./services/debtRules/ruleEngine.js");
      if (!isDebtRulesEnabled()) {
        return res.json({ enabled: false, hasData: false, recommendations: [], families: [] });
      }

      const { buildDebtRuleContext } = await import("./services/debtRules/context.js");
      const ctx = await buildDebtRuleContext(userId);
      if (!ctx) {
        // Faltan insumos (cartola + CMF). El front muestra el CTA de subir documentos.
        return res.json({ enabled: true, hasData: false, recommendations: [], families: [] });
      }

      const t0 = Date.now();
      const recommendations = evaluateDebtRules(ctx);

      // Familias en orden fijo para el front (aunque no todas tengan reglas activas).
      const { FAMILY_LABELS } = await import("./services/debtRules/types.js");
      const families = (Object.keys(FAMILY_LABELS) as Array<keyof typeof FAMILY_LABELS>)
        .map((f) => ({
          familia: f,
          label: FAMILY_LABELS[f],
          recommendations: recommendations.filter((r) => r.familia === f),
        }))
        .filter((g) => g.recommendations.length > 0);

      // Trazabilidad NCG 502 (fire-and-forget).
      const reqId =
        typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length > 0
          ? (req.headers["x-request-id"] as string)
          : crypto.randomUUID();
      import("./services/audit/traceabilityPersistence.js")
        .then(({ logDebtRulesEvaluation }) =>
          logDebtRulesEvaluation({
            userId,
            requestId: reqId,
            input: {
              deudaFlujo: ctx.health.ratios.deudaFlujo,
              deudaActivos: ctx.health.ratios.deudaActivos,
              ahorroIngreso: ctx.health.ratios.ahorroIngreso,
              moraActiva: ctx.health.ratios.moraActiva,
              diasMora: ctx.health.ratios.diasMora,
              nivel: ctx.health.nivel,
              zona: ctx.health.zona,
              tiposCredito: ctx.tiposCredito,
            },
            output: { rules: recommendations.map((r) => r.key), count: recommendations.length },
            processingTimeMs: Date.now() - t0,
          }),
        )
        .catch((err) => logger.warn({ err }, "debt-rules traceability failed (non-fatal)"));

      res.json({
        enabled: true,
        hasData: true,
        nivel: ctx.health.nivel,
        zona: ctx.health.zona,
        recommendations,
        families,
      });
    } catch (e) {
      logger.error({ err: e }, "debt-rules recommendations error");
      res.status(500).json({ message: "Error al calcular las recomendaciones." });
    }
  });

  // Accounts (Open Banking) routes
}
