import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";
import { anonymizeUser } from "./services/privacy/accountAnonymization.js";
import { db, users, accounts, transactions, creditScores, eq, and, desc } from "./db/index.js";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { expensiveLimiter, authLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./logger.js";

import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerProfileRoutes(app: Express): Promise<void> {
  app.get("/api/profile", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);

      // Try to get user from database first
      let user = await storage.getUser(userId);

      // If user doesn't exist in our database, create from JWT payload
      if (!user) {
        try {
          const authReq = req as AuthenticatedRequest;
          const newUser = await storage.createUser({
            id: userId,
            username: authReq.user?.email?.split("@")[0] || userId,
            email: authReq.user?.email || `${userId}@unknown.com`,
            passwordHash: "jwt-auth",
            firstName: authReq.user?.name || null,
            lastName: null,
            displayName: authReq.user?.name || null,
            profilePicture: null,
          });
          user = newUser;
        } catch (error) {
          logger.error({ err: error }, "Error creating user from JWT data");
          const authReq = req as AuthenticatedRequest;
          // Fallback to JWT payload
          return res.json({
            id: userId,
            displayName: authReq.user?.name || "",
            email: authReq.user?.email || "",
            timezone: "UTC",
            language: "English",
          });
        }
      }

      // Return user profile data
      res.json({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        timezone: user.timezone || "UTC",
        language: user.language || "English",
        profilePicture: user.profilePicture,
        userMetadata: user.userMetadata,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      logger.error({ err: error }, "Profile get error");
      res.status(500).json({ message: "Failed to get profile" });
    }
  });

  app.put("/api/profile", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { displayName, firstName, lastName, timezone, language, userMetadata, profilePicture } =
        req.body;

      // First check if user exists, if not create them
      let user = await storage.getUser(userId);

      if (!user) {
        // Create user from JWT payload if they don't exist
        try {
          user = await storage.createUser({
            id: userId,
            username: String(
              (req as AuthenticatedRequest).user?.name ||
                ((req as AuthenticatedRequest).user?.email as string)?.split("@")[0] ||
                userId,
            ),
            email: ((req as AuthenticatedRequest).user?.email as string) || `${userId}@unknown.com`,
            passwordHash: "jwt-auth",
            firstName: ((req as AuthenticatedRequest).user?.name as string) || null,
            lastName: null,
            displayName: ((req as AuthenticatedRequest).user?.name as string) || null,
          });
        } catch (createError) {
          logger.error({ err: createError }, "Error creating user");
          return res.status(500).json({ message: "Failed to create user profile" });
        }
      }

      // Update user in database
      const updatedUser = await storage.updateUser(userId, {
        displayName,
        firstName,
        lastName,
        timezone,
        language,
        userMetadata,
        ...(typeof profilePicture === "string" ? { profilePicture } : {}),
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "Failed to update user profile" });
      }

      res.json({
        id: updatedUser.id,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        timezone: updatedUser.timezone,
        language: updatedUser.language,
        profilePicture: updatedUser.profilePicture,
        userMetadata: updatedUser.userMetadata,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      logger.error({ err: error }, "Profile update error");
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // User management routes - Sensitive operations
  app.post(
    "/api/profile/change-password",
    authenticate,
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        getUserIdFromAuth(req);
        // Flujo real: reset por correo vía /api/auth/forgot-password (cuando exista). Mientras tanto, guía al usuario.
        res.json({
          message:
            "Para cambiar tu contraseña, cierra sesión y en el inicio de sesión usa «Olvidé mi contraseña». Si no recibes el correo, revisa spam o contacta a soporte.",
        });
      } catch (error) {
        logger.error({ err: error }, "Password change error");
        res.status(500).json({ message: "Failed to send password change email" });
      }
    },
  );

  // GET /api/profile/accounts/:accountId/transactions-sfa — movimientos del titular renderizados
  // en el formato del Sistema de Finanzas Abiertas (CMF, NCG 514/569, ISO 20022). Diagnóstico/
  // readiness: muestra cómo se ven las cartolas ya normalizadas en el schema exacto que CODA
  // consumirá como PSBI cuando entren en vigencia las APIs. Solo datos propios del usuario.
  app.get(
    "/api/profile/accounts/:accountId/transactions-sfa",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = getUserIdFromAuth(req);
        const accountId = Number(req.params.accountId);
        const userAccounts = await storage.getAccounts(userId);
        const owned = userAccounts.find((a: { id: number }) => a.id === accountId);
        if (!owned) return res.status(404).json({ message: "Cuenta no encontrada" });

        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
        const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
        const pageSize = Math.min(
          200,
          Math.max(1, parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
        );

        const txs = await storage.getTransactions(accountId, {
          from: fromDate ? new Date(fromDate) : undefined,
          to: toDate ? new Date(toDate) : undefined,
        });
        const { buildSfaTransactionsResponse } = await import("./services/sfa/sfaMapper.js");
        const baseUrl = `${req.protocol}://${req.get("host")}/api/profile/accounts/${accountId}/transactions-sfa`;
        const resp = buildSfaTransactionsResponse(
          txs.map((t: any) => ({
            id: t.id,
            externalId: t.externalId,
            postedAt: t.postedAt,
            description: t.description,
            amount: Number(t.amount),
            currency: t.currency ?? "CLP",
          })),
          { baseUrl, fromDate, toDate, page, pageSize },
        );
        res.json(resp);
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/profile/my-data — exportación de todos los datos del titular (Ley 21.719 Art. 13).
  // Rate-limit: 1 solicitud/hora vía expensiveLimiter (ventana 60 min).
  app.get(
    "/api/profile/my-data",
    authenticate,
    expensiveLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = getUserIdFromAuth(req);

        const [profile] = await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            rutHash: users.rutHash,
            kycStatus: users.kycStatus,
            onboardingCompleted: users.onboardingCompleted,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!profile) return res.status(404).json({ message: "Usuario no encontrado" });

        // El RUT se guarda seudonimizado (hash irreversible) — no hay texto plano que devolver.
        // Se informa solo si el sistema tiene uno registrado, no su valor.
        const { rutHash, ...profileRest } = profile;
        const profileForExport = { ...profileRest, rutOnFile: !!rutHash };

        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 24);
        const cutoff = cutoffDate.toISOString().slice(0, 10);

        const { documentUploads: docUploads, consentGrants: grants } =
          await import("./db/index.js");
        const [userTransactions, userAccounts, userCreditScores, userDocuments, userConsentGrants] =
          await Promise.all([
            db
              .select()
              .from(transactions)
              .where(and(eq(transactions.userId, userId), desc(transactions.date) as any))
              .limit(2000),
            db.select().from(accounts).where(eq(accounts.userId, userId)),
            db.select().from(creditScores).where(eq(creditScores.userId, userId)),
            db
              .select({
                id: (docUploads as any).id,
                tipo: (docUploads as any).tipo,
                banco: (docUploads as any).banco,
                parseStatus: (docUploads as any).parseStatus,
                createdAt: (docUploads as any).createdAt,
              })
              .from(docUploads as any)
              .where(eq((docUploads as any).userId, userId)),
            db
              .select()
              .from(grants as any)
              .where(eq((grants as any).userId, userId)),
          ]);

        // description va cifrada en reposo → descifrar para el export del titular (RTBF, en claro).
        const { looksEncrypted, decryptField } =
          await import("./services/crypto/fieldEncryption.js");
        const txsPlano = (userTransactions as Array<Record<string, unknown>>).map((t) => {
          const d = t.description;
          return typeof d === "string" && looksEncrypted(d)
            ? { ...t, description: decryptField(d) }
            : t;
        });

        res.setHeader("Content-Disposition", 'attachment; filename="mis-datos-coda.json"');
        res.json({
          exportedAt: new Date().toISOString(),
          dataController: "CODA Finance SpA",
          legalBasis: "Ley 21.719 Art. 13 — Derecho de acceso del titular",
          profile: profileForExport,
          accounts: userAccounts,
          transactions: txsPlano,
          creditScores: userCreditScores,
          documents: userDocuments,
          consentGrants: userConsentGrants,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/profile/account",
    authenticate,
    authLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = getUserIdFromAuth(req);
        logger.info({ userId }, "Received request to delete account");

        // Anonimización irreversible (Ley 19.628/21.719) — ver services/privacy/accountAnonymization.ts.
        await anonymizeUser(userId);
        logger.info({ userId }, "Account anonymization complete");

        res.json({ message: "Account deleted successfully" });
      } catch (error) {
        // Let the central error handler deal with it
        next(error);
      }
    },
  );

  app.get("/api/profile/mfa-status", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const user = await storage.getUser(userId);
      const enrolled = !!(
        user && Number((user as { twoFactorEnabled?: number }).twoFactorEnabled ?? 0) === 1
      );
      res.json({ enrolled, methods: enrolled ? ["totp"] : [] });
    } catch (error) {
      logger.error({ err: error }, "MFA status error");
      res.status(500).json({ message: "Failed to get MFA status" });
    }
  });

  app.post("/api/profile/enable-mfa", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      // MFA not implemented for JWT auth
      res.status(501).json({ message: "MFA not implemented for JWT authentication" });
    } catch (error) {
      logger.error({ err: error }, "MFA enrollment error");
      res.status(500).json({ message: "Failed to enable MFA" });
    }
  });

  // Financial products routes (public)
}
