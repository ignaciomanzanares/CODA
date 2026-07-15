/**
 * Autenticación de instituciones financieras para la API de leads (Fase 2).
 *
 * Las instituciones se autentican con una API key (header `X-API-Key`), NO con el JWT de usuario.
 * Se guarda solo el hash SHA-256 de la key; al autenticar se hashea la key recibida y se busca por
 * igualdad exacta indexada. Cada key pertenece a un `provider` y solo accede a sus propios leads.
 */
import { createHash, randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, institutionApiKeys, eq, and } from "../../db/index.js";

export interface AuthenticatedInstitutionRequest extends Request {
  institution?: { provider: string; keyId: number };
}

/** SHA-256 (hex) de una API key. La key es aleatoria de alta entropía → no requiere salt/pepper. */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/** Genera una API key nueva con prefijo identificable. Se muestra en claro una sola vez. */
export function generateApiKey(): string {
  return `coda_${randomBytes(24).toString("base64url")}`;
}

/**
 * Middleware: valida el header `X-API-Key`, resuelve la institución dueña y la adjunta a
 * `req.institution`. 401 si falta o es inválida/revocada.
 */
export async function authenticateInstitution(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.header("X-API-Key");
    if (!apiKey) {
      return res.status(401).json({ error: "Unauthorized", message: "Falta el header X-API-Key" });
    }
    const keyHash = hashApiKey(apiKey);
    const [row] = await db
      .select()
      .from(institutionApiKeys)
      .where(and(eq(institutionApiKeys.keyHash, keyHash), eq(institutionApiKeys.active, 1)))
      .limit(1);

    if (!row) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "API key inválida o revocada" });
    }

    // best-effort: registrar último uso sin bloquear el request.
    db.update(institutionApiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(institutionApiKeys.id, row.id))
      .catch(() => {});

    (req as AuthenticatedInstitutionRequest).institution = {
      provider: row.provider,
      keyId: row.id,
    };
    next();
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: "Auth de institución falló" });
  }
}
