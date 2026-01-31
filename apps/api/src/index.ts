import "dotenv/config";
import "./env.js";

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes.js";
import { checkDatabaseConnection } from "./db/index.js";
import { logger, httpLogger } from "./logger.js";



const app = express();
// Required for correct client IPs and secure cookies on Render
app.set("trust proxy", 1);



// Robust CORS: allow configurable origins via environment variable
// CORS_ORIGINS should be a comma-separated list of allowed origins
// Example: CORS_ORIGINS=https://coda-web-steel.vercel.app,http://localhost:5173

const defaultOrigins = [
  // Production: Vercel frontend
  "https://coda-web-steel.vercel.app",
  // Development: local Vite dev server
  "http://localhost:5173",
  // Preview deployments (Vercel generates unique URLs)
  // Add specific preview URLs to CORS_ORIGINS env var as needed
];

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : defaultOrigins;
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 200
};


// Universal CORS preflight handler for all routes (always respond with CORS headers)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", allowedOrigins.includes(req.headers.origin || "") ? req.headers.origin : "");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,Accept");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

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
    logger.info("🚀 Starting CODA application...");
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
