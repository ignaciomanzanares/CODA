import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { apiLimiter, expensiveLimiter } from "./middleware/rateLimiter.js";
import { storage } from "./storage.js";
import { logger } from "./logger.js";
import {
  evaluateHealthV2,
  HEALTH_EVALUATION_ENGINE_VERSION,
} from "./services/healthEvaluation/index.js";
import { resolveHealthInputForUser } from "./services/healthEvaluation/healthInputResolver.js";
import { logFinancialHealthV2 } from "./services/audit/traceabilityPersistence.js";

const NIVEL_DESCRIPCION: Record<number, string> = {
  [-2]: "Tu deuda supera tus activos o está en mora grave. Se recomienda asesoría legal para explorar reestructuración o proceso concursal.",
  [-1]: "Tu carga de deuda es alta respecto a tu flujo. Una reestructuración puede reducir el peso mensual.",
  [0]: "Estás al día en deudas pero sin excedente de ahorro. Un refinanciamiento preventivo puede mejorar tus condiciones.",
  [1]: "Tienes excedente para empezar a ahorrar. El objetivo es construir un fondo de emergencia de 3 meses.",
  [2]: "Tienes un fondo básico consolidado. Es momento de considerar instrumentos de mayor rendimiento.",
  [3]: "Tu base financiera es sólida. Puedes diversificar con instrumentos de bajo riesgo como FFMM o ETF.",
  [4]: "Tienes un portafolio diversificado activo. Considera ampliar a activos alternativos o internacionales.",
  [5]: "Tus activos generan flujo sin necesidad de trabajo activo. El objetivo es optimizar y proteger el patrimonio.",
};

/** Shared handler for health evaluation — used by both GET /me and POST /recalculate. */

async function handleHealthEvaluationMe(req: Request, res: Response): Promise<any> {
  const authReq = req as AuthenticatedRequest;
  const t0 = Date.now();
  try {
    const userId = authReq.user!.userId;
    const requestId = randomUUID();

    // Detección de datos faltantes (mensajería granular en la respuesta).
    // CMF: buscar ambos tipos — 'cmf' (parser nuevo) y 'cmf_informe_deudas' (parser antiguo).
    const [cartolas, cmfDocsNew, cmfDocsLegacy] = await Promise.all([
      storage.listDocumentUploadsByType(userId, "cartola"),
      storage.listDocumentUploadsByType(userId, "cmf"),
      storage.listDocumentUploadsByType(userId, "cmf_informe_deudas"),
    ]);
    const cmfDocs = [...cmfDocsNew, ...cmfDocsLegacy];

    logger.info(
      {
        userId,
        cartolas: cartolas.length,
        cmfNew: cmfDocsNew.length,
        cmfLegacy: cmfDocsLegacy.length,
      },
      "[health-eval] docs found",
    );

    if (cartolas.length === 0 || cmfDocs.length === 0) {
      return res.json({
        hasData: false,
        missingData: {
          cartola: cartolas.length === 0,
          cmf: cmfDocs.length === 0,
        },
      });
    }

    // Input del motor v2 desde la fuente ÚNICA (misma derivación que la traza R1).
    const resolved = await resolveHealthInputForUser(userId);
    if (!resolved) {
      // Docs presentes pero el CMF más reciente no tiene parsedData.
      return res.json({ hasData: false, missingData: { cartola: false, cmf: true } });
    }

    const evaluation = evaluateHealthV2(resolved.healthInput, resolved.scoringContext);

    // Trazabilidad NCG 502 — persistida antes de responder (ver algorithmicTraceability.ts)
    await logFinancialHealthV2({
      userId,
      requestId,
      input: {
        deudaFlujo: evaluation.ratios.deudaFlujo,
        deudaActivos: evaluation.ratios.deudaActivos,
        ahorroIngreso: evaluation.ratios.ahorroIngreso,
        moraActiva: evaluation.ratios.moraActiva,
        diasMora: evaluation.ratios.diasMora,
      },
      output: {
        nivel: evaluation.nivel,
        nivelNombre: evaluation.nivelNombre,
        salida: evaluation.salida,
        zona: evaluation.zona,
        scoreCompuesto: evaluation.scoreCompuesto,
        scoreRatios: evaluation.scoreRatios,
        scoreInterno: evaluation.scoreInterno,
        nivelBruto: evaluation.nivelBruto,
      },
      processingTimeMs: Date.now() - t0,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    // Para llegar aquí ya se validó (línea ~64) que existen cartola Y CMF con
    // datos parseables; declararlo explícito para que el checklist de onboarding
    // marque ambos pasos como completados (sin esto, missingData quedaba undefined
    // y el frontend los pintaba como pendientes pese a estar subidos).
    res.json({
      hasData: true,
      missingData: { cartola: false, cmf: false },
      evaluation,
      modelVersion: HEALTH_EVALUATION_ENGINE_VERSION,
      descripcionNivel: NIVEL_DESCRIPCION[evaluation.nivel],
    });
  } catch (e) {
    logger.error({ err: e }, "health-evaluation/me failed");
    res.status(500).json({ message: "Error al evaluar salud financiera." });
  }
}

export function registerHealthEvaluationRoutes(app: Express): void {
  // GET /api/health-evaluation/me — última evaluación del usuario
  app.get("/api/health-evaluation/me", apiLimiter, authenticate, handleHealthEvaluationMe);

  // POST /api/health-evaluation/recalculate — fuerza recálculo (misma lógica que GET /me)
  app.post(
    "/api/health-evaluation/recalculate",
    expensiveLimiter,
    authenticate,
    handleHealthEvaluationMe,
  );

  // GET /api/health-evaluation/level/:level — explica un nivel y su producto (requiere auth)
  app.get(
    "/api/health-evaluation/level/:level",
    apiLimiter,
    authenticate,
    async (req: Request, res: Response) => {
      const level = parseInt(req.params.level, 10);
      if (isNaN(level) || level < -2 || level > 5) {
        return res.status(400).json({ message: "Nivel debe estar entre -2 y 5." });
      }

      const nivelInfo: Record<number, { nombre: string; salida: string; productoEjemplo: string }> =
        {
          [-2]: {
            nombre: "Insolvencia activa",
            salida: "Proceso concursal",
            productoEjemplo: "Asesoría legal especializada",
          },
          [-1]: {
            nombre: "Endeudado",
            salida: "Reestructuración",
            productoEjemplo: "Plan de pago estructurado",
          },
          [0]: {
            nombre: "Sin deudas",
            salida: "Refinanciamiento preventivo",
            productoEjemplo: "Crédito de consolidación",
          },
          [1]: { nombre: "Fondo básico", salida: "Ahorro", productoEjemplo: "Cuenta de ahorro" },
          [2]: {
            nombre: "Fondo consolidado",
            salida: "Ahorro",
            productoEjemplo: "Depósito a plazo",
          },
          [3]: {
            nombre: "Inversión inicial",
            salida: "Inversión",
            productoEjemplo: "Fondo mutuo o ETF",
          },
          [4]: {
            nombre: "Inversión diversificada",
            salida: "Inversión",
            productoEjemplo: "Cartera diversificada multi-clase",
          },
          [5]: {
            nombre: "Independencia financiera",
            salida: "Gestión patrimonial",
            productoEjemplo: "Gestión de patrimonio activo",
          },
        };

      res.json({
        nivel: level,
        ...nivelInfo[level],
        descripcion: NIVEL_DESCRIPCION[level],
      });
    },
  );

  logger.info("🩺 Health evaluation routes registered");
}
