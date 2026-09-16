import pino from "pino";
import { isDevelopment } from "./env.js";
import { redactForLog } from "./services/hardening/piiSafe.js";

/**
 * Formatters del logger, exportados para testearlos contra un stream real.
 * `log` aplica `redactForLog` a TODO objeto logueado (D8 "logs sin PII"): emails y RUTs salen
 * enmascarados aunque la llamada los pase en claro.
 */
export const loggerFormatters = {
  level: (label: string) => {
    return { level: label };
  },
  log: (object: Record<string, unknown>) => redactForLog(object),
};

/**
 * Centralized logger configuration using Pino
 * Provides structured logging with different levels and formatters
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment() ? "debug" : "info"),
  transport: isDevelopment()
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: loggerFormatters,
  base: {
    env: process.env.NODE_ENV,
  },
});

/**
 * Logger for HTTP requests
 * Use with Express middleware
 */
export const httpLogger = logger.child({ module: "http" });

/**
 * Logger for database operations
 */
export const dbLogger = logger.child({ module: "database" });

/**
 * Logger for ML operations
 */
export const mlLogger = logger.child({ module: "ml" });

/**
 * Logger for authentication operations
 */
export const authLogger = logger.child({ module: "auth" });

/**
 * Logger for background jobs
 */
export const jobLogger = logger.child({ module: "jobs" });
