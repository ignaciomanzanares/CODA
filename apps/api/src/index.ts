import "dotenv/config";
import "./env.js";

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes.js";
import { checkDatabaseConnection } from "./db.js";
import { logger, httpLogger } from "./logger.js";


const app = express();

// Allow requests from Vercel and localhost
app.use(cors({
  origin: [
    "https://coda-web-steel.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

app.use((req: Request, res: Response, next: NextFunction) => {
  next();
});

(async () => {
  try {
    logger.info("🚀 Starting FinHealth application...");
    logger.info("✅ Application initialization completed successfully");
  } catch (error) {
    logger.error({ error }, "❌ Error during application initialization");
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the error
    if (status >= 500) {
      logger.error({ err, status, message }, "Server error occurred");
    } else {
      logger.warn({ status, message }, "Client error occurred");
    }

    res.status(status).json({ message });
    throw err;
  });

  // CODA serves API only (like CODA-Empresas)
  // Frontend runs separately on apps/web with its own dev server
  // In production, frontend is served by a static host or CDN

  // ALWAYS serve the app on port 5000
  const port = Number(process.env.PORT) || 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
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
