import type { Express, Request, Response } from "express";
import { db, users, betaWaitlist, eq } from "./db/index.js";
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
import { authLimiter, publicLimiter } from "./middleware/rateLimiter.js";
import { requireAdmin } from "./middleware/auth.js";
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

  // ── Verificación de email ────────────────────────────────────────────────
  // El link del correo llega aquí (público: el usuario puede no tener sesión).
  app.post("/api/auth/verify-email", publicLimiter, async (req: Request, res: Response) => {
    const { verifyEmailVerificationToken } = await import("./middleware/auth.js");
    const parsed = verifyEmailVerificationToken(String(req.body?.token ?? ""));
    if (!parsed) {
      return res
        .status(400)
        .json({ message: "El enlace de verificación no es válido o expiró. Pide uno nuevo." });
    }
    try {
      const [row] = await db
        .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, parsed.userId));
      if (!row || row.email !== parsed.email) {
        return res.status(400).json({ message: "El enlace no corresponde a esta cuenta." });
      }
      if (!row.emailVerifiedAt) {
        await db
          .update(users)
          .set({ emailVerifiedAt: new Date().toISOString() })
          .where(eq(users.id, parsed.userId));
      }
      res.json({ success: true, message: "¡Correo verificado!" });
    } catch (e) {
      logger.error({ err: e }, "[auth] verify-email falló");
      res.status(500).json({ message: "No pudimos verificar tu correo. Intenta de nuevo." });
    }
  });

  // Reenvío (autenticado, rate-limited).
  app.post(
    "/api/auth/resend-verification",
    authenticate,
    authLimiter,
    async (req: Request, res: Response) => {
      const { sendVerificationEmailFor } = await import("./middleware/auth.js");
      const user = (req as { user?: { userId: string; email: string } }).user!;
      const [row] = await db
        .select({ emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, user.userId));
      if (row?.emailVerifiedAt) {
        return res.json({ success: true, message: "Tu correo ya está verificado." });
      }
      await sendVerificationEmailFor(user.userId, user.email);
      res.json({ success: true, message: "Te enviamos un nuevo enlace de verificación." });
    },
  );

  // ── Beta cerrada ─────────────────────────────────────────────────────────
  // Estado del flag (público): el frontend decide si mostrar el gate de
  // invitación en /registro. No expone los códigos.
  app.get("/api/beta/status", (_req: Request, res: Response) => {
    res.json({ closedBeta: process.env.CLOSED_BETA === "true" });
  });

  // Valida un código de invitación ANTES de iniciar el wizard de registro
  // (evita completar todo el flujo para descubrir un código inválido al final).
  app.post("/api/beta/validate-code", publicLimiter, async (req: Request, res: Response) => {
    const { isValidBetaInvite } = await import("./middleware/auth.js");
    res.json({ valid: isValidBetaInvite(req.body?.code) });
  });

  // Lista de espera (público, rate-limited). Siempre 200 con el mismo mensaje
  // — sin enumeración de correos; el duplicado se ignora en silencio.
  app.post("/api/beta/waitlist", publicLimiter, async (req: Request, res: Response) => {
    const raw = (req.body?.email ?? "") as string;
    const email = String(raw).trim().toLowerCase();
    const ok = () =>
      res.json({ success: true, message: "¡Listo! Te avisaremos cuando abramos el acceso." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ message: "Ingresa un correo válido." });
    }
    try {
      await db.insert(betaWaitlist).values({ email }).onConflictDoNothing();
    } catch (e) {
      logger.warn({ err: e }, "[beta] waitlist insert falló (no fatal)");
    }
    return ok();
  });

  // Lista de espera para el admin (contactar al abrir el acceso).
  app.get(
    "/api/admin/beta/waitlist",
    authenticate,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db.select().from(betaWaitlist);
        res.json({ waitlist: rows });
      } catch (e) {
        logger.error({ err: e }, "[beta] waitlist admin falló");
        res.status(500).json({ message: "Error al obtener la lista de espera." });
      }
    },
  );
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
