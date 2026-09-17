/**
 * Conectores de fuentes de datos institucionales (Fase 5): AFP, SII, Tesorería.
 *
 * Flujo guiado: el usuario descarga el PDF oficial con Clave Única en el sitio de la fuente y lo
 * sube aquí. Se extraen los datos (mejor esfuerzo, ver services/dataSources/govParsers.ts) y se
 * persisten para enriquecer los ratios de salud. NO manejamos credenciales del usuario.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { authenticate, ensureUserForToken, type AuthenticatedRequest } from "./middleware/auth.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { validateBody } from "./middleware/validation.js";
import { logger } from "./logger.js";
import type { GovSource } from "./services/dataSources/types.js";
import { SII_CARPETA_CONNECTOR_ID } from "./connectors/sources/index.js";

const VALID_SOURCES: GovSource[] = ["afp", "sii", "tgr"];

/**
 * Código + clave de una Carpeta Tributaria (D5). La vigencia la fija el SII al generarla (90 días
 * la regular, 365 si el emisor lo eligió); el titular la declara acá y el secreto se borra solo al
 * vencer. Tope de 365 días para que nada quede guardado más de lo que sirve.
 */
const carpetaSecretSchema = z.object({
  codigo: z.string().trim().min(4).max(64),
  clave: z.string().trim().min(4).max(128),
  diasVigencia: z.number().int().positive().max(365).optional(),
});

export function registerDataSourceRoutes(app: Express) {
  // Sube el PDF oficial de una fuente y extrae sus datos.
  app.post(
    "/api/data-sources/:source",
    apiLimiter,
    authenticate,
    async (req: Request, res: Response) => {
      const source = req.params.source as GovSource;
      if (!VALID_SOURCES.includes(source)) {
        return res.status(400).json({ message: "Fuente inválida. Usa afp, sii o tgr." });
      }

      const { documentUpload } = await import("./middleware/uploadMiddleware.js");
      documentUpload.single("file")(req, res, async (uploadErr: unknown) => {
        if (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : "Archivo inválido.";
          return res.status(400).json({ message: msg });
        }
        const file = (req as Request & { file?: { buffer: Buffer } }).file;
        if (!file) {
          return res.status(400).json({ message: "Se requiere el PDF oficial de la fuente." });
        }
        try {
          const userId = (req as AuthenticatedRequest).user!.userId;
          const { extractPdfText } = await import("./services/documents/pdfAnalysis.js");
          const { text } = await extractPdfText(file.buffer);

          const { detectGovSource, parseGovDocument } =
            await import("./services/dataSources/govParsers.js");
          const detected = detectGovSource(text);
          if (detected && detected !== source) {
            return res.status(400).json({
              message: `El documento parece ser de ${detected.toUpperCase()}, no de ${source.toUpperCase()}. Verifica que subiste el archivo correcto.`,
            });
          }

          const result = parseGovDocument(source, text);
          if (!result.ok) {
            return res.status(422).json({
              message: result.message ?? "No se pudieron extraer los datos del documento.",
              source,
            });
          }

          const { saveGovSourceData } = await import("./services/dataSources/govSourceService.js");
          await saveGovSourceData(userId, result);

          res.json({
            ok: true,
            source,
            data: {
              verifiedMonthlyIncomeClp: result.verifiedMonthlyIncomeClp ?? null,
              fiscalDebtClp: result.fiscalDebtClp ?? null,
              contributionMonths: result.contributionMonths ?? null,
            },
          });
        } catch (e) {
          logger.error({ err: e, source }, "[dataSources] upload falló");
          res.status(500).json({ message: "Error al procesar el documento." });
        }
      });
    },
  );

  // Estado de las fuentes conectadas por el usuario.
  app.get("/api/data-sources", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.userId;
      const { getGovSources } = await import("./services/dataSources/govSourceService.js");
      res.json({ sources: await getGovSources(userId) });
    } catch (e) {
      logger.error({ err: e }, "[dataSources] getGovSources falló");
      res.status(500).json({ message: "Error al obtener las fuentes." });
    }
  });

  // D1 — Consultas a fuentes hechas con los datos del usuario: qué fuente, bajo qué
  // consentimiento, qué la disparó y cómo terminó (incluye las rechazadas por falta de consentimiento).
  app.get("/api/data-sources/access-log", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.userId;
      const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);
      const { listSourceAccessForUser } = await import("./services/audit/sourceAccessAudit.js");
      res.json({ entries: await listSourceAccessForUser(userId, limit) });
    } catch (e) {
      logger.error({ err: e }, "[dataSources] access-log falló");
      res.status(500).json({ message: "Error al obtener el registro de consultas." });
    }
  });

  // ── D5: la Carpeta Tributaria que el titular delega ────────────────────────────────────────
  // El secreto entra por acá y NO vuelve a salir: se guarda cifrado en la bóveda y sólo lo lee el
  // conector. Estos endpoints nunca devuelven el código ni la clave.

  app.post(
    "/api/data-sources/sii-carpeta/secreto",
    apiLimiter,
    authenticate,
    validateBody(carpetaSecretSchema),
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
        const { codigo, clave, diasVigencia } = req.body as z.infer<typeof carpetaSecretSchema>;
        const { storeSecret } = await import("./services/secrets/connectorSecretVault.js");
        const descriptor = await storeSecret({
          userId,
          connectorId: SII_CARPETA_CONNECTOR_ID,
          secret: { codigo, clave },
          expiresAt: new Date(Date.now() + (diasVigencia ?? 90) * 24 * 60 * 60 * 1000),
        });
        return res.status(201).json(descriptor);
      } catch (e) {
        logger.error({ err: e }, "[dataSources] guardar secreto de la carpeta falló");
        res.status(500).json({ message: "No se pudo guardar el acceso a la carpeta." });
      }
    },
  );

  /** Estado del acceso guardado: si existe, cuándo vence y cuándo se usó. Nunca el secreto. */
  app.get(
    "/api/data-sources/sii-carpeta/secreto",
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
        const { describeSecret } = await import("./services/secrets/connectorSecretVault.js");
        const descriptor = await describeSecret(userId, SII_CARPETA_CONNECTOR_ID);
        return res.json({ configurado: descriptor !== null, acceso: descriptor });
      } catch (e) {
        logger.error({ err: e }, "[dataSources] describir secreto de la carpeta falló");
        res.status(500).json({ message: "No se pudo consultar el acceso a la carpeta." });
      }
    },
  );

  /** El titular revoca el acceso: la carpeta sigue siendo suya, CODA deja de poder consultarla. */
  app.delete(
    "/api/data-sources/sii-carpeta/secreto",
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
        const { deleteSecret } = await import("./services/secrets/connectorSecretVault.js");
        const borrado = await deleteSecret(userId, SII_CARPETA_CONNECTOR_ID);
        return res.json({ borrado });
      } catch (e) {
        logger.error({ err: e }, "[dataSources] borrar secreto de la carpeta falló");
        res.status(500).json({ message: "No se pudo revocar el acceso a la carpeta." });
      }
    },
  );

  /**
   * Dispara la consulta al SII (por la cola si hay Redis, si no en el request). Pasa por el gate
   * de consentimiento `sii_tax_data` y queda en la traza. Hoy responde 501: el fetch contra el
   * sitio del SII está pendiente de capturar el flujo del receptor con una carpeta real.
   */
  app.post(
    "/api/data-sources/sii-carpeta/consultar",
    apiLimiter,
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
        const { requestConnectorRun } = await import("./connectors/runConnector.js");
        const out = await requestConnectorRun(userId, SII_CARPETA_CONNECTOR_ID);
        return res.json(out);
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "consent_required") {
          return res.status(403).json({
            message: "Falta tu consentimiento para consultar datos tributarios.",
            code,
          });
        }
        if (code === "secret_missing" || code === "secret_expired") {
          return res.status(409).json({
            message:
              code === "secret_expired"
                ? "El acceso a tu carpeta venció: genera una nueva y comparte el código."
                : "Primero comparte el código y la clave de tu carpeta tributaria.",
            code,
          });
        }
        if (code === "pending_fetch") {
          return res.status(501).json({
            message: "Traer la carpeta desde el SII todavía no está implementado.",
            code,
          });
        }
        logger.error({ err: e }, "[dataSources] consulta de la carpeta falló");
        res.status(500).json({ message: "No se pudo consultar la carpeta tributaria." });
      }
    },
  );

  // D1 — Perfil canónico: identidad, renta, deuda y empleo con procedencia por dato (fuente,
  // fecha, confianza). Capa de lectura: no cambia el scoring.
  app.get("/api/profile/canonical", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const { assembleCanonicalProfile } = await import("./services/canonical/index.js");
      res.json(await assembleCanonicalProfile(userId));
    } catch (e) {
      logger.error({ err: e }, "[dataSources] perfil canónico falló");
      res.status(500).json({ message: "Error al armar el perfil." });
    }
  });
}
