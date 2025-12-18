import pino from "pino";
import { isDevelopment } from "./env";

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
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
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
