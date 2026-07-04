import "dotenv/config";
import "./env.js";

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { csrfOriginCheck } from "./middleware/csrf.js";
import { registerRoutes } from "./routes.js";
import { registerAuditRoutes } from "./routes-audit.js";
import { registerHealthEvaluationRoutes } from "./routes-health-evaluation.js";
import { registerAssetsRoutes } from "./routes-assets.js";
import { registerInstitutionRoutes } from "./routes-institutions.js";
import { checkDatabaseConnection } from "./db/index.js";
import { logger, httpLogger } from "./logger.js";
import { initializeTraceabilitySystem } from "./services/audit/algorithmicTraceability.js";
import { ensureSeedTraceabilityModels } from "./services/audit/traceabilityPersistence.js";
import {
  captureError,
  getNormalizedRoute,
  httpMetricsMiddleware,
  initObservability,
  registerMetricsEndpoint,
} from "./services/observability/index.js";



const app = express();
// Required for correct client IPs and secure cookies on Render
app.set("trust proxy", 1);



// CORS: defaults siempre incluyen dominio propio; CORS_ORIGINS en Render *añade* más (no reemplaza).
// Evita Access-Control-Allow-Origin vacío ("") que rompe el login desde el navegador.
const defaultOrigins = [
  "https://coda-web-steel.vercel.app",
  "https://www.codafinance.cl",
  "https://codafinance.cl",
  "http://localhost:5173",
];

const extraOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = [...new Set([...defaultOrigins, ...extraOrigins])];

logger.info({ allowedOrigins }, "CORS: allowed origins");

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn({ origin }, "CORS: origin not allowed");
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "X-Request-Id",
    "X-CSRF-Token",
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Security headers — API JSON-only (no HTML/estáticos servidos desde aquí), así
// que el CSP por defecto de helmet ('self') no rompe nada y agrega defensa extra.
app.use(
  helmet({
    frameguard: { action: "deny" },
    // El front (Vercel, otro origen) consume esta API solo vía fetch/JSON — no
    // hay <img>/<script> cross-origin que dependan de CORP/COEP relajado.
  })
);
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Los uploads de archivos van por multer (multipart/form-data), no por aquí —
// este límite solo acota el JSON/urlencoded de rutas normales contra abuso.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
// Parsea cookies para que `authenticate` pueda leer el JWT desde la cookie httpOnly
// (además del Authorization: Bearer). Inerte mientras AUTH_COOKIE_ENABLED=false.
app.use(cookieParser());
// CSRF Origin/Referer allowlist para mutaciones cookie-auth. Inerte salvo
// CSRF_ENFORCE=true (default off). Va tras cookieParser (necesita req.cookies)
// y antes de las rutas. No toca CORS allowedHeaders ni el frontend.
app.use(csrfOriginCheck);
app.use(httpMetricsMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Las métricas HTTP (contador por método/status + latencia) las emite
      // httpMetricsMiddleware (arriba). Aquí solo queda el logging de la request.
      // Skip logging 304 Not Modified responses to reduce noise
      if (res.statusCode === 304) {
        return;
      }

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      logger.info(logLine);
    }
  });
  next();
});

registerMetricsEndpoint(app);

(async () => {
  try {
    logger.info("🚀 Starting CODA application...");

    // Observabilidad (Sentry/captura de errores) — no-op si SENTRY_DSN no está.
    await initObservability();

    // Aplica migraciones pendientes ANTES de todo (no depende de render.yaml ni
    // del dashboard). Si falla, el arranque aborta (fail-fast) y Render reinicia.
    const { runPendingMigrations } = await import("./db/migrate.js");
    await runPendingMigrations();

    // Initialize algorithmic traceability system (CMF compliance)
    initializeTraceabilitySystem();
    try {
      await ensureSeedTraceabilityModels();
    } catch (seedErr) {
      // Non-fatal: traceability seed can fail if DB is cold-starting — routes still work
      logger.warn({ err: seedErr }, "⚠️ Traceability seed failed (non-fatal, will retry on first request)");
    }

    // Promoción sin redeploy (#5): si hay un modelo 'production' registrado en
    // algorithm_model_versions con artefacto en el blob store, cárgalo. No-op seguro:
    // si no hay fila/artefacto, se sirve artifacts/current local. Fire-and-forget para no
    // bloquear el arranque.
    void import("./services/modelRegistry.js")
      .then(({ PDModelRegistry }) => PDModelRegistry.instance().loadProductionFromRegistry())
      .catch((err) => logger.warn({ err }, "loadProductionFromRegistry (boot) falló; usando modelo local"));

    // Job de retención (#21): borra los originales (PDF/imagen) vencidos del blob store. Corre al
    // boot y luego cada 24h. Desactivado en test. RETENTION_JOB_ENABLED=false para apagarlo.
    if (process.env.NODE_ENV !== "test" && process.env.RETENTION_JOB_ENABLED !== "false") {
      const runRetention = async () => {
        try {
          const { purgeExpiredOriginals } = await import("./services/documents/originalStore.js");
          await purgeExpiredOriginals();
        } catch (err) {
          logger.warn({ err }, "[retention] purgeExpiredOriginals falló");
        }
      };
      void runRetention();
      const retentionTimer = setInterval(runRetention, 24 * 60 * 60 * 1000);
      retentionTimer.unref?.();

      // Reponderación de productos por conversión real (#35): al boot y cada 7 días. Apagable con
      // RANKING_WEIGHTS_JOB_ENABLED=false.
      if (process.env.RANKING_WEIGHTS_JOB_ENABLED !== "false") {
        const runReweight = async () => {
          try {
            const { recomputeProductRankingWeights } = await import("./services/products/productRankingWeights.js");
            await recomputeProductRankingWeights();
          } catch (err) {
            logger.warn({ err }, "[ranking-weights] recompute falló");
          }
        };
        void runReweight();
        const reweightTimer = setInterval(runReweight, 7 * 24 * 60 * 60 * 1000);
        reweightTimer.unref?.();
      }
    }

    // Monitor de profundidad de cola (#27): alerta a Ops si la cola de documentos se satura
    // (worker caído). No-op si no hay Redis. Desactivado en test.
    if (process.env.NODE_ENV !== "test") {
      try {
        const { startQueueDepthMonitor } = await import("./services/observability/queueMonitor.js");
        startQueueDepthMonitor();
      } catch (err) {
        logger.warn({ err }, "[queueMonitor] no se pudo iniciar");
      }
    }

    logger.info("✅ Application initialization completed successfully");
  } catch (error) {
    logger.error({ error }, "❌ Error during application initialization");
    process.exit(1);
  }

  // IMPORTANT: Register ALL routes BEFORE starting server
  // Register audit & compliance routes FIRST
  registerAuditRoutes(app);
  registerAssetsRoutes(app);
  registerHealthEvaluationRoutes(app);
  registerInstitutionRoutes(app);

  // Then register main routes
  const server = await registerRoutes(app);

  app.use((err: Error & { status?: number; statusCode?: number }, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the error
    if (status >= 500) {
      captureError(err, {
        environment: process.env.NODE_ENV ?? "development",
        method: req.method,
        route: getNormalizedRoute(req),
        status,
      });
    } else {
      logger.warn({ status, message }, "Client error occurred");
    }

    // Don't send response if headers already sent
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // CODA serves API only (like CODA-Empresas)
  // Frontend runs separately on apps/web with its own dev server
  // In production, frontend is served by a static host or CDN

  // ALWAYS serve the app on port 5000
  const port = Number(process.env.PORT) || 5000;
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    logger.info(`🌐 API Server listening on port ${port}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 Health check: http://localhost:${port}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown...`);
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
