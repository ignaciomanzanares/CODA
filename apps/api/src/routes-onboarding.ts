/**
 * Onboarding de primer ingreso (detrás del flag ENABLE_ONBOARDING en el cliente).
 *
 * 3 pasos: Términos+consentimiento (real) → KYC (mock de UI) → 2FA (TOTP/flag).
 *  - El consentimiento se registra en privacy_consent_events vía
 *    /api/privacy-consents/accept (NCG 502) — no se duplica aquí.
 *  - El 2FA usa /api/auth/2fa/enable existente.
 *  - Aquí sólo viven: estado del onboarding, KYC mock, y marcar finalizado.
 *
 * KYC es MOCK: no se suben/almacenan imágenes ni biometría reales; sólo se
 * persiste kyc_status='mock_completed' para no re-pedirlo.
 */
import type { Express, Request, Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { db, privacyConsentEvents } from "./db/index.js";
import { storage } from "./storage.js";
import { logger } from "./logger.js";

function userId(req: Request): string {
  return (req as AuthenticatedRequest).user?.userId ?? "";
}

/** ¿El usuario ya registró el consentimiento de tratamiento de datos? */
async function hasDataProcessingConsent(uid: string): Promise<boolean> {
  if (!db) return false;
  const [row] = await db
    .select({ action: privacyConsentEvents.action })
    .from(privacyConsentEvents)
    .where(
      and(
        eq(privacyConsentEvents.userId, uid),
        eq(privacyConsentEvents.purpose, "data_processing"),
      ),
    )
    .orderBy(desc(privacyConsentEvents.createdAt))
    .limit(1);
  return row?.action === "accepted";
}

export function registerOnboardingRoutes(app: Express): void {
  // GET /api/onboarding/status — estado para el gate del cliente.
  app.get("/api/onboarding/status", authenticate, async (req: Request, res: Response) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ message: "No autenticado." });
    try {
      const user = await storage.getUser(uid);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado." });
      const consentGiven = await hasDataProcessingConsent(uid);
      const u = user as {
        kycStatus?: string | null;
        onboardingCompleted?: number;
        twoFactorEnabled?: number;
      };
      return res.json({
        completed: Number(u.onboardingCompleted ?? 0) === 1,
        consentGiven,
        kycStatus: u.kycStatus ?? null,
        twoFactorEnabled: Number(u.twoFactorEnabled ?? 0) === 1,
      });
    } catch (e) {
      logger.error({ err: e }, "GET /api/onboarding/status failed");
      return res.status(500).json({ message: "Error al obtener el estado del onboarding." });
    }
  });

  // POST /api/onboarding/kyc — KYC mock: marca verificación de identidad completa.
  // No sube ni almacena imágenes/biometría reales (sin proveedor todavía).
  app.post("/api/onboarding/kyc", authenticate, async (req: Request, res: Response) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ message: "No autenticado." });
    try {
      await storage.updateUser(uid, { kycStatus: "mock_completed" } as Record<string, unknown>);
      return res.json({ kycStatus: "mock_completed" });
    } catch (e) {
      logger.error({ err: e }, "POST /api/onboarding/kyc failed");
      return res.status(500).json({ message: "Error al registrar la verificación de identidad." });
    }
  });

  // POST /api/onboarding/complete — marca el flujo de 3 pasos como finalizado.
  // Requiere consentimiento + KYC; el 2FA puede quedar pendiente ("más tarde").
  app.post("/api/onboarding/complete", authenticate, async (req: Request, res: Response) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ message: "No autenticado." });
    try {
      const user = await storage.getUser(uid);
      const consentGiven = await hasDataProcessingConsent(uid);
      const kycOk = (user as { kycStatus?: string | null })?.kycStatus === "mock_completed";
      if (!consentGiven || !kycOk) {
        return res.status(400).json({
          message:
            "Faltan pasos: registra el consentimiento y completa la verificación de identidad.",
          consentGiven,
          kycStatus: (user as { kycStatus?: string | null })?.kycStatus ?? null,
        });
      }
      await storage.updateUser(uid, { onboardingCompleted: 1 } as Record<string, unknown>);
      return res.json({ completed: true });
    } catch (e) {
      logger.error({ err: e }, "POST /api/onboarding/complete failed");
      return res.status(500).json({ message: "Error al finalizar el onboarding." });
    }
  });

  logger.info("🚀 Onboarding routes registered");
}

/**
 * Guard de 2FA para vincular cuentas bancarias. Cuando el onboarding está activo
 * (ENABLE_ONBOARDING), el 2FA es OBLIGATORIO antes de conectar un banco.
 * Devuelve un mensaje claro (409) si falta. Con el flag apagado, no bloquea nada.
 */
export async function requireTwoFactorForBankLink(
  uid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (process.env.ENABLE_ONBOARDING !== "true") return { ok: true };
  const user = await storage.getUser(uid);
  const enabled =
    Number((user as { twoFactorEnabled?: number } | undefined)?.twoFactorEnabled ?? 0) === 1;
  if (enabled) return { ok: true };
  return {
    ok: false,
    message: "Activa la verificación en dos pasos (2FA) antes de vincular una cuenta bancaria.",
  };
}
