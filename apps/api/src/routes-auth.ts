import type { Express, Request, Response } from "express";
import { db, users, eq } from "./db/index.js";
import {
  authenticate,
  handleLoginWithDB,
  handleLogout,
  handleMe,
  handleRegister,
  handleVerify2FA,
  handleEnable2FA,
  handleDisable2FA,
  handleResend2FA,
  handleRecoverMigrationPassword,
  hashPassword,
} from "./middleware/auth.js";
import { clearAuthCookie } from "./middleware/authCookie.js";
import { env } from "./env.js";
import { emailService } from "./services/emailService.js";
import crypto from "crypto";
import { authLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./logger.js";

export async function registerAuthRoutes(app: Express): Promise<void> {
  // Health check endpoint (no auth required)
  app.get("/health", async (_req, res) => {
    try {
      // Import DB dynamically; the module may export `db` or fall back to undefined
      const dbModule: any = await import("./db/index.js");
      const db = dbModule.db;
      const dbHealthy = !!db;
      const { PDModelRegistry } = await import("./services/modelRegistry.js");
      const mlReady = PDModelRegistry.instance().isReady;

      // Si REDIS_URL está configurada, un Redis caído rompe en silencio el rate
      // limiting distribuido y la cola de documentos (no hay fallback automático
      // a memoria una vez que ya se eligió Redis) — el load balancer debe verlo.
      const { redis } = await import("./redis.js");
      let redisStatus: "connected" | "down" | "not-configured" = "not-configured";
      if (redis) {
        try {
          await Promise.race([
            redis.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 1500)),
          ]);
          redisStatus = "connected";
        } catch {
          redisStatus = "down";
        }
      }

      const status = {
        status: redisStatus === "down" ? "degraded" : "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          database: dbHealthy ? "connected" : "in-memory",
          redis: redisStatus,
          ml_model: mlReady ? "ready" : "loading",
          auth: "jwt",
        },
        version: process.env.npm_package_version || "1.0.0",
      };

      res.status(redisStatus === "down" ? 503 : 200).json(status);
    } catch (_error) {
      res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      });
    }
  });

  // Auth routes
  app.post("/api/auth/register", authLimiter, handleRegister);
  app.post("/api/auth/login", authLimiter, handleLoginWithDB);
  /** Recuperar contraseña tras migración (requiere MIGRATION_RECOVERY_SECRET en el servidor). */
  app.post("/api/auth/recover-migration-password", authLimiter, handleRecoverMigrationPassword);
  app.post("/api/auth/logout", authenticate, handleLogout);
  app.get("/api/auth/me", authenticate, handleMe);

  // 2FA routes
  app.post("/api/auth/2fa/verify", authLimiter, handleVerify2FA);
  app.post("/api/auth/2fa/resend", authLimiter, handleResend2FA);
  app.post("/api/auth/2fa/enable", authenticate, handleEnable2FA);
  app.post("/api/auth/2fa/disable", authenticate, handleDisable2FA);

  // Password reset token store: token -> { userId, expiresAt }
  const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();
  // Periodic cleanup: remove expired reset tokens every hour to prevent memory growth
  setInterval(
    () => {
      const now = Date.now();
      for (const [tok, val] of passwordResetTokens.entries()) {
        if (val.expiresAt < now) passwordResetTokens.delete(tok);
      }
    },
    60 * 60 * 1000,
  ).unref();

  /** POST /api/auth/forgot-password — generates a reset link and emails it */
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    const { email } = req.body ?? {};
    // Always respond with success to avoid email enumeration
    const ok = () =>
      res.json({ message: "Si el correo está registrado, recibirás las instrucciones." });
    if (!email || typeof email !== "string") return ok();
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);
      if (!user) return ok();
      // Expire any previous token for this user
      for (const [tok, val] of passwordResetTokens.entries()) {
        if (val.userId === user.id) passwordResetTokens.delete(tok);
      }
      const token = crypto.randomBytes(32).toString("hex");
      passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 60 * 60 * 1000 });
      const resetUrl = `${env.clientUrl}/restablecer-contrasena?token=${token}`;
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      logger.error({ err }, "forgot-password error");
    }
    return ok();
  });

  /** POST /api/auth/reset-password — validates token and sets new password */
  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    const { token, password } = req.body ?? {};
    if (!token || typeof token !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({ message: "Token y contraseña son requeridos." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres." });
    }
    const entry = passwordResetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      return res.status(400).json({ message: "El enlace ha expirado o no es válido." });
    }
    try {
      // Al cambiar la contraseña, invalida también las sesiones existentes
      // (tokenInvalidatedAt): cualquier JWT emitido antes de este reset queda
      // rechazado por `authenticate`, cerrando sesiones potencialmente robadas.
      await db
        .update(users)
        .set({ passwordHash: hashPassword(password), tokenInvalidatedAt: new Date().toISOString() })
        .where(eq(users.id, entry.userId));
      passwordResetTokens.delete(token);
      // Limpia la cookie de sesión si el flag está activo (no-op si no).
      clearAuthCookie(res);
      return res.json({ message: "Contraseña actualizada correctamente." });
    } catch (err) {
      logger.error({ err }, "reset-password error");
      return res.status(500).json({ message: "Error al actualizar la contraseña." });
    }
  });

  // Error handling middleware
}
