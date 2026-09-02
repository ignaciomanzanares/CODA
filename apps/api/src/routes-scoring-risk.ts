import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";
import { db, accounts } from "./db/index.js";
import { authenticate, ensureUserForToken, type AuthenticatedRequest } from "./middleware/auth.js";
import { evaluateGovernmentPrograms } from "./services/governmentPrograms.js";
import crypto from "crypto";
import { expensiveLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./logger.js";

import { validateBody, scoringApplicationSchema } from "./middleware/validation.js";
import { getUserIdFromAuth, getMLArtifactsDir } from "./routes-shared.js";

export async function registerScoringRiskRoutes(app: Express): Promise<void> {
  // D7 — Reconciliación de ingresos: confianza por fuente + discrepancias (informalidad,
  // no declarado, obsoleto, brecha). Aditivo: no cambia el score, alimenta banderas/insights.
  app.get("/api/income/reconciliation", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const { getIncomeReconciliationForUser } =
        await import("./services/risk/incomeReconciliationService.js");
      res.json(await getIncomeReconciliationForUser(userId));
    } catch (e) {
      logger.error({ err: e }, "income reconciliation failed");
      res.status(500).json({ message: "Error al reconciliar ingresos." });
    }
  });

  // R1 — Traza auditable de la salud: por qué el usuario quedó en este nivel (variable→corte→aporte).
  app.get("/api/health/explain", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const { explainUserHealth } = await import("./services/healthEvaluation/index.js");
      const audit = await explainUserHealth(userId);
      if (!audit) return res.json({ available: false, reason: "Faltan datos (cartola o CMF)." });
      res.json({ available: true, audit });
    } catch (e) {
      logger.error({ err: e }, "health explain failed");
      res.status(500).json({ message: "Error al explicar la salud financiera." });
    }
  });

  // R4 — Catálogo de variables para la consola del prestador: qué es exponible vs protegido/
  // proxy/interno, con el fundamento de cada una. Es metodología (sin datos de usuario).
  app.get("/api/lender/variables", authenticate, async (_req: Request, res: Response) => {
    try {
      const { lenderVariableCatalog } = await import("./services/risk/lenderConsole.js");
      res.json({ catalog: lenderVariableCatalog() });
    } catch (e) {
      logger.error({ err: e }, "lender variables failed");
      res.status(500).json({ message: "Error al listar variables." });
    }
  });

  // R5 — Simula una política del prestador sobre un COHORTE SINTÉTICO (nunca usuarios reales):
  // tasa de aprobación + rechazos por variable. El guard de fairness ignora criterios sobre
  // variables no exponibles. Body: { name?, criteria: [{ variable, op, threshold }] }.
  app.post("/api/lender/policy/simulate", authenticate, async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        name?: unknown;
        criteria?: unknown;
        cohortSize?: unknown;
      };
      if (!Array.isArray(body.criteria)) {
        return res.status(400).json({ message: "Se requiere 'criteria' (arreglo)." });
      }
      const criteria = body.criteria
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({
          variable: String(c.variable ?? ""),
          op: c.op as ">=" | "<=" | ">" | "<" | "==",
          threshold: typeof c.threshold === "boolean" ? c.threshold : Number(c.threshold),
          label: c.label != null ? String(c.label) : undefined,
        }));
      const cohortSize = Math.min(
        2000,
        Math.max(50, Number.isFinite(Number(body.cohortSize)) ? Number(body.cohortSize) : 500),
      );
      const { runLenderConsoleSimulation } = await import("./services/risk/lenderConsole.js");
      const result = runLenderConsoleSimulation(
        {
          lenderId: "console",
          name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Política",
          version: "draft",
          criteria,
        },
        cohortSize,
      );
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "lender simulate failed");
      res.status(500).json({ message: "Error al simular la política." });
    }
  });

  app.get("/api/financial-health", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      // Fuente de verdad: tabla `transactions`. Excluye transferencias internas
      // (pago de tarjeta, divisas) para que NO inflen el ingreso ni la tasa de ahorro.
      const { isInternalTransferTx } = await import("./services/assistantContext.js");
      const { getUserNormalizedTransactions, getReportedBalance } =
        await import("./services/normalizedTransactions.js");
      const { transactions: txs } = await getUserNormalizedTransactions(userId);
      if (txs.length === 0) {
        return res.json({ hasData: false, healthLevel: null, programs: [], savingsTips: [] });
      }

      const { computeMonthlyHealthMetrics, mesesDeFondoEmergencia } =
        await import("./services/financialHealthMetrics.js");
      const { monthlyIncome, monthlyExpenses, savingsRate, hasEduExpenses, eduPct } =
        computeMonthlyHealthMetrics(txs, isInternalTransferTx);

      const saldoActual: number = (await getReportedBalance(userId)) ?? 0;
      const mesesCubiertos = mesesDeFondoEmergencia(saldoActual, monthlyExpenses);

      const credit = await storage.getCreditScore(userId);
      const txScore = await storage.getTransactionalScore(userId);

      const result = evaluateGovernmentPrograms({
        monthlyIncome,
        monthlyExpenses,
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
      // Cascada completa: transacciones normalizadas → score docs → document_uploads.
      // Sin esto quedaban transacciones (y score docs) huérfanas tras "empezar de cero".
      const { deleteTransactionsForDocument } =
        await import("./services/documents/normalizeCartola.js");
      const scoreDocs = await storage.listScoreDocumentUploadsByType(userId, "cartola");
      for (const s of scoreDocs) {
        await deleteTransactionsForDocument(userId, s.id).catch(() => {});
        await storage.deleteScoreDocumentUploadById(s.id, userId).catch(() => {});
      }
      const deleted = await storage.deleteDocumentUploadsByType(userId, "cartola");
      logger.info({ userId, deleted, scoreDocs: scoreDocs.length }, "Cartolas deleted by user");
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
      const { findRelatedScoreDocsForDocumentUpload } =
        await import("./services/documents/documentUploadLinks.js");
      const { countTransactionsForDocument } =
        await import("./services/documents/normalizeCartola.js");
      const scoreDocs = await storage.listScoreDocumentUploadsByType(userId, "cartola");
      const enriched = await Promise.all(
        docs.map(async (doc: { id: string }) => {
          const related = findRelatedScoreDocsForDocumentUpload(doc, scoreDocs);
          const counts = await Promise.all(
            related.docs.map((s: { id: string }) => countTransactionsForDocument(s.id)),
          );
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
      const { deleteRelatedScoreDocsForDocumentUpload } =
        await import("./services/documents/documentUploadLinks.js");
      const cascade = await deleteRelatedScoreDocsForDocumentUpload(userId, doc);
      await storage.deleteDocumentUploadById(docId, userId);
      logger.info({ userId, docId, ...cascade }, "Document + derived transactions deleted");
      res.json({ success: true, removedTransactions: cascade.removedTransactions });
    } catch (e) {
      logger.error({ err: e }, "Failed to delete user document");
      res.status(500).json({ message: "Error al eliminar el documento." });
    }
  });

  // POST /api/user/documents/:id/review — el usuario marca una importación como revisada.
  // Dueño-único (otro usuario → 404); idempotente (re-marcar refresca reviewed_at).
  app.post("/api/user/documents/:id/review", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const updated = await storage.markDocumentReviewed(req.params.id, userId);
      if (!updated) return res.status(404).json({ message: "Documento no encontrado." });
      res.json({
        success: true,
        reviewStatus: updated.reviewStatus,
        reviewedAt: updated.reviewedAt,
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to mark document reviewed");
      res.status(500).json({ message: "Error al marcar el documento como revisado." });
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
      const { getNormalizedTransactionalScoreForUser } =
        await import("./services/normalizedTransactionalScore.js");
      const normalizedScore = await getNormalizedTransactionalScoreForUser(userId);
      if (normalizedScore) {
        if (normalizedScore.transactionalScore != null) {
          storage
            .addScoreHistoryEntry(
              userId,
              normalizedScore.transactionalScore,
              100,
              JSON.stringify(normalizedScore.metrics ?? {}),
            )
            .catch(() => {});
        }
        return res.json({
          transactionalScore: normalizedScore.transactionalScore,
          mainInsights: normalizedScore.mainInsights ?? [],
          metrics: normalizedScore.metrics,
          recommendedProducts: normalizedScore.recommendedProducts ?? [],
          lastUpdated: new Date().toISOString(),
          source: normalizedScore.source,
        });
      }
      const data = await storage.getTransactionalScore(userId);
      if (!data) {
        return res.json({
          transactionalScore: null,
          mainInsights: [],
          metrics: undefined,
          recommendedProducts: [],
        });
      }
      // Save to score history (fire-and-forget)
      if (data.transactionalScore != null) {
        storage
          .addScoreHistoryEntry(
            userId,
            data.transactionalScore,
            100,
            JSON.stringify(data.metrics ?? {}),
          )
          .catch(() => {});
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

  /**
   * Doble evaluador de riesgo (Fase D): score tradicional (control) + transaccional CODA (beta)
   * desde el profile unificado, con segmento, titular y reconciliación. Alimenta la tarjeta de score.
   */
  app.get("/api/risk/evaluation", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      // Flag de rollout (Fase F): gateado en producción hasta validar con outcomes locales (Fase G).
      // En dev/test va habilitado; en prod requiere RISK_DUAL_SCORE_ENABLED=true. Defensa en profundidad:
      // el front ya lo esconde tras FEATURES.riskDualScore, esto protege el endpoint ante llamadas directas.
      const dualEnabled =
        process.env.NODE_ENV !== "production" || process.env.RISK_DUAL_SCORE_ENABLED === "true";
      if (!dualEnabled) return res.status(404).json({ message: "No disponible." });

      const userId = await ensureUserForToken(authReq.user!);
      if (!userId)
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });

      const startedAt = Date.now();
      const { evaluateRisk } = await import("./services/risk/evaluateRisk.js");
      const evaluation = await evaluateRisk(userId);
      if (!evaluation) {
        return res.json({
          available: false,
          message: "Aún no hay datos suficientes. Sube tu Informe CMF y una cartola.",
        });
      }

      // Trazabilidad NCG 502 (fire-and-forget): una fila por modelo emitido.
      import("./services/audit/traceabilityPersistence.js")
        .then(({ logRiskEvaluation }) =>
          logRiskEvaluation({
            userId,
            requestId: crypto.randomUUID(),
            segment: evaluation.segment,
            traditional: evaluation.traditional.available
              ? {
                  input: evaluation.traditional.features,
                  output: {
                    pd: evaluation.traditional.pd,
                    score: evaluation.traditional.score,
                    band: evaluation.traditional.band.label,
                  },
                }
              : null,
            transactional: evaluation.transactional.available
              ? {
                  input: { transactionMonths: true },
                  output: {
                    pd: evaluation.transactional.pd,
                    score: evaluation.transactional.score,
                    band: evaluation.transactional.band,
                  },
                }
              : null,
            processingTimeMs: Date.now() - startedAt,
          }),
        )
        .catch((err) => logger.warn({ err }, "logRiskEvaluation failed (non-fatal)"));

      return res.json({ available: true, ...evaluation });
    } catch (e) {
      logger.error({ err: e }, "Get risk evaluation failed");
      res.status(500).json({ message: "Error al evaluar el riesgo." });
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
        logger.warn(
          { path: "/api/credit-score" },
          "Credit score: usuario no encontrado para token",
        );
        return res.status(404).json({ message: "Usuario no encontrado. Inicia sesión de nuevo." });
      }
      const { getCreditScoreAvailability } = await import("./services/creditScoreAvailability.js");
      const result = await getCreditScoreAvailability(String(userId), storage);
      logger.info(
        {
          userId,
          available: result.available,
          reason: result.available ? null : result.reason,
          path: "/api/credit-score",
        },
        "Credit score: estado CMF resuelto",
      );
      res.json(result);
    } catch (e) {
      logger.error(
        { err: e, userId, path: "/api/credit-score" },
        "Get credit score failed (posible error SQL o columna)",
      );
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
    reasons: Array<{
      feature: string;
      contribution: number;
      direction: "increases_risk" | "decreases_risk";
    }>,
    features: Record<string, unknown>,
    startedAt: number,
  ) {
    try {
      const { logCreditScorePrediction } =
        await import("./services/audit/algorithmicTraceability.js");
      const { randomUUID } = await import("node:crypto");
      const creditScore = Math.round(850 - pd * 550);
      const riskCategory =
        creditScore >= 750
          ? "EXCELLENT"
          : creditScore >= 680
            ? "GOOD"
            : creditScore >= 620
              ? "AVERAGE"
              : creditScore >= 550
                ? "POOR"
                : "VERY_POOR";
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
        { processingTimeMs: Date.now() - startedAt },
      );
    } catch (err) {
      logger.warn({ err }, "Failed to persist XGB prediction trace");
    }
  }

  // PD Scoring (protected) - Expensive operation
  app.post(
    "/api/scoring/application",
    authenticate,
    expensiveLimiter,
    validateBody(scoringApplicationSchema),
    async (req, res) => {
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
            // El modelo se evalúa desde xgb.json en TS (carga síncrona), así que isReady es
            // confiable de inmediato — ya no hace falta el sleep ni el fallback ONNX one-off
            // (que además leía el tensor `label` en vez de `probabilities`). Si no está listo,
            // cae a baseline.
            if (reg.isReady) {
              const pd = await reg.scoreXGB(fv);
              const instanceReasons = reg.explainInstance(fv, 5);
              const reasons = ["model:xgb", ...instanceReasons.map((r) => r.feature)];
              await tracePdXgbPrediction(userId, pd, instanceReasons, fv, startedAt);
              return res.json({
                pd,
                reasons,
                reasonDetail: instanceReasons,
                features: fv,
                model: reg.getManifest(),
              });
            }
            logger.warn("XGB model not ready, falling back to baseline");
          } catch (err) {
            logger.warn({ err }, "XGB scoring failed, falling back to baseline");
          }
        }

        // Baseline
        const { scorePD } = await import("./services/pdScoring.js");
        const scored = scorePD(fv);
        res.json({ pd: scored.pd, reasons: scored.reasons, features: fv });
      } catch (_e) {
        logger.error({ err: _e }, "Error scoring PD");
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

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
            await tracePdXgbPrediction(
              userId,
              pd,
              instanceReasons,
              fv as Record<string, unknown>,
              startedAt,
            );
            return res.json({
              pd,
              reasons,
              reasonDetail: instanceReasons,
              features: fv,
              model: reg.getManifest(),
            });
          }

          // Fallback: score directly via ONNXRuntime (one-off session) if registry not ready
          const pathMod = await import("node:path");
          const fsMod = await import("node:fs");
          const baseDir = await getMLArtifactsDir();
          const manifest = JSON.parse(
            fsMod.readFileSync(pathMod.join(baseDir, "manifest.json"), "utf-8"),
          );
          const featureMeta = JSON.parse(
            fsMod.readFileSync(
              pathMod.join(baseDir, manifest.feature_meta_path || "feature_meta.json"),
              "utf-8",
            ),
          );
          const onnxPath = pathMod.join(baseDir, manifest.onnx_path || "xgb_pd.onnx");
          const ortMod: any = await import("onnxruntime-node");
          const ortAny: any = (ortMod as any)?.default ?? ortMod;
          const feats = featureMeta.features.map((k: string) => Number((fv as any)[k] ?? 0));
          const input = new Float32Array(feats);
          const tensor = new ortAny.Tensor("float32", input, [1, feats.length]);
          const session = await ortAny.InferenceSession.create(onnxPath, {
            executionProviders: ["cpu"],
          });
          const outputs = await session.run({ input: tensor });
          const out = (outputs as any)[Object.keys(outputs)[0]];
          let p = Number(Array.isArray(out.data) ? out.data[0] : out.data[0]);
          const cal = manifest?.calibration;
          if (
            cal?.type === "platt" &&
            typeof cal.params?.a === "number" &&
            typeof cal.params?.b === "number"
          ) {
            const z = cal.params.a * p + cal.params.b;
            p = 1 / (1 + Math.exp(-z));
          }
          const reasons = ["model:xgb", ...((manifest?.shap_top || []) as string[]).slice(0, 5)];
          return res.json({ pd: p, reasons, features: fv, model: manifest });
        } catch (err) {
          logger.warn({ err }, "XGB scoring failed, falling back");
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
      res.status(500).json({ message: "Internal server error" });
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
      res.status(500).json({ message: "Internal server error" });
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
          return res
            .status(503)
            .json({ message: "No hay datos suficientes para explicar el modelo." });
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
          return res.json({
            features: fv,
            explanation: { method: "heuristic", topFeatures: ranked },
          });
        } catch (e) {
          return res.json({ features: fv, explanation: { method: "heuristic", topFeatures: [] } });
        }
      }

      const p = cp.spawn(py, [script, "--artifacts", baseDir, "--top", String(top)], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let out = "";
      let err = "";
      p.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      p.stderr.on("data", (d: Buffer) => {
        err += d.toString();
      });
      p.on("error", () => {});

      p.stdin.write(JSON.stringify(fv));
      p.stdin.end();

      p.on("close", (code: number) => {
        if (code !== 0) {
          logger.warn(
            { stderr: err, stdout: out },
            "SHAP explainer failed, returning heuristic fallback",
          );
          const featureKeys = Object.keys(fv || {});
          const ranked = featureKeys
            .map((k) => ({ feature: k, value: (fv as any)[k] }))
            .sort((a, b) => Math.abs((b.value || 0) as number) - Math.abs((a.value || 0) as number))
            .slice(0, top);
          return res.json({
            features: fv,
            explanation: { method: "heuristic", topFeatures: ranked },
          });
        }
        try {
          const parsed = JSON.parse(out);
          return res.json({ features: fv, explanation: parsed });
        } catch (_e) {
          logger.warn(
            { err: _e, stdout: out },
            "SHAP explainer parse error, returning heuristic fallback",
          );
          const featureKeys = Object.keys(fv || {});
          const ranked = featureKeys
            .map((k) => ({ feature: k, value: (fv as any)[k] }))
            .sort((a, b) => Math.abs((b.value || 0) as number) - Math.abs((a.value || 0) as number))
            .slice(0, top);
          return res.json({
            features: fv,
            explanation: { method: "heuristic", topFeatures: ranked },
          });
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
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Expenses routes
}
