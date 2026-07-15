/**
 * Registro estructurado de eventos de autenticación (CMF / continuidad / respuesta a incidentes).
 * No registrar contraseñas ni tokens completos.
 */

import type { Request } from "express";
import { authLogger } from "../logger.js";

export function getClientIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"];
  const first = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
  return (
    first ||
    (typeof req.socket?.remoteAddress === "string" ? req.socket.remoteAddress : null) ||
    null
  );
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : null;
}

/** Para logs sin exponer el correo completo. */
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export type AuthSecurityEvent =
  | "login_success"
  | "login_failed"
  | "login_demo"
  | "twofa_challenge"
  | "twofa_verified"
  | "twofa_failed"
  | "twofa_email_failed"
  | "register_success"
  | "logout"
  | "enable_2fa"
  | "disable_2fa"
  | "resend_2fa"
  | "migration_password_recovery";

export function logAuthSecurityEvent(
  event: AuthSecurityEvent,
  req: Request,
  extra?: Record<string, unknown>,
): void {
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);
  authLogger.info(
    {
      event,
      ip,
      ua: userAgent ? userAgent.slice(0, 200) : undefined,
      ...extra,
    },
    `auth:${event}`,
  );
}
