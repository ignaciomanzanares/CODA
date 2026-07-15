import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { db, userAssets } from "./db/index.js";
import { logger } from "./logger.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { assetSignature } from "./services/assets/types.js";

// Tope de la columna PostgreSQL `integer` (int4). Validar aquí da un mensaje
// claro en vez de un 500 opaco por overflow en la BD.
const INT4_MAX = 2_147_483_647;

/**
 * Normaliza un monto CLP ANTES de validar. Acepta number o string.
 * Los puntos/espacios/símbolos son SIEMPRE separadores de miles (nunca decimal):
 * se eliminan para obtener un entero plano. Ej: "104.313.182" → 104313182,
 * "86527994" → 86527994. String vacío → null (campo limpiado); ausente → undefined.
 */
function normalizeClpAmount(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const digits = trimmed.replace(/[^\d]/g, "");
    return digits === "" ? value : Number.parseInt(digits, 10);
  }
  return value;
}

function clpAmountSchema(opts: { nullable: boolean }) {
  const base = z
    .number({ invalid_type_error: "debe ser un monto numérico" })
    .int("debe ser un monto entero (sin decimales)")
    .positive("debe ser mayor a 0")
    .max(INT4_MAX, "excede el monto máximo permitido");
  // El preprocess normaliza ANTES de validar; para campos opcionales el monto
  // normalizado puede ser null (campo vacío/limpiado), así que el inner debe aceptarlo.
  return z.preprocess(normalizeClpAmount, opts.nullable ? base.nullable() : base);
}

const clpAmount = clpAmountSchema({ nullable: false });
const clpAmountOptional = clpAmountSchema({ nullable: true }).optional();

const FIELD_LABELS: Record<string, string> = {
  type: "Tipo de activo",
  name: "Descripción",
  acquisitionCostClp: "Costo de adquisición",
  estimatedValueClp: "Valor estimado actual",
  lienAmountClp: "Monto de la garantía",
  hasLien: "Garantía",
  notes: "Notas",
};

/** Construye un mensaje legible (qué campo, por qué) a partir del primer issue de Zod. */
function firstValidationError(error: z.ZodError): { message: string; field: string } {
  const issue = error.issues[0];
  const field = String(issue?.path?.[0] ?? "");
  const label = FIELD_LABELS[field] ?? field ?? "dato";
  return { message: `Revisa "${label}": ${issue?.message ?? "valor inválido"}.`, field };
}

const createAssetSchema = z.object({
  type: z.enum(["property", "vehicle", "crypto", "investment", "other"], {
    errorMap: () => ({ message: "tipo de activo inválido" }),
  }),
  name: z.string().min(1, "la descripción es obligatoria").max(200),
  acquisitionCostClp: clpAmount,
  estimatedValueClp: clpAmountOptional,
  hasLien: z.boolean().default(false),
  lienAmountClp: clpAmountOptional,
  currency: z.string().default("CLP"),
  documentId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const updateAssetSchema = createAssetSchema.partial();

export function registerAssetsRoutes(app: Express): void {
  // GET /api/assets — lista activos del usuario
  app.get("/api/assets", apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const rows = await db
        .select()
        .from(userAssets)
        .where(eq(userAssets.userId, userId))
        .orderBy(userAssets.createdAt);

      res.json(rows.map(mapRow));
    } catch (e) {
      logger.error({ err: e }, "GET /api/assets failed");
      res.status(500).json({ message: "Error al obtener activos." });
    }
  });

  // GET /api/assets/summary — total consolidado por tipo
  app.get("/api/assets/summary", apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const rows = await db.select().from(userAssets).where(eq(userAssets.userId, userId));

      const byType: Record<string, number> = {};
      let declaradosClp = 0;
      for (const row of rows) {
        const value = row.estimatedValueClp ?? row.acquisitionCostClp;
        byType[row.type] = (byType[row.type] ?? 0) + value;
        declaradosClp += value;
      }

      res.json({ declaradosClp, byType, count: rows.length });
    } catch (e) {
      logger.error({ err: e }, "GET /api/assets/summary failed");
      res.status(500).json({ message: "Error al obtener resumen de activos." });
    }
  });

  // POST /api/assets — registrar nuevo activo
  app.post("/api/assets", apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const parsed = createAssetSchema.safeParse(req.body);
      if (!parsed.success) {
        const { message, field } = firstValidationError(parsed.error);
        return res.status(400).json({ message, field, errors: parsed.error.issues });
      }

      const data = parsed.data;

      // Idempotencia: si ya existe un activo IDÉNTICO (misma firma) para el
      // usuario, devolver ese en vez de insertar un duplicado. Evita los
      // huérfanos que generaba el viejo flujo de edición roto (borrar + re-crear).
      // Sólo coincidencia exacta; activos legítimamente parecidos sí se insertan.
      const existingOfType = await db
        .select()
        .from(userAssets)
        .where(and(eq(userAssets.userId, userId), eq(userAssets.type, data.type)));
      const newSig = assetSignature({
        userId,
        type: data.type,
        name: data.name,
        acquisitionCostClp: data.acquisitionCostClp,
        lienAmountClp: data.lienAmountClp ?? null,
      });
      const duplicate = existingOfType.find(
        (row: any) =>
          assetSignature({
            userId: row.userId,
            type: row.type,
            name: row.name,
            acquisitionCostClp: row.acquisitionCostClp,
            lienAmountClp: row.lienAmountClp ?? null,
          }) === newSig,
      );
      if (duplicate) {
        // 200 (no 201): no se creó nada nuevo; se devuelve el existente.
        return res.status(200).json(mapRow(duplicate));
      }

      const now = new Date().toISOString();
      const id = randomUUID();

      await db.insert(userAssets).values({
        id,
        userId,
        type: data.type,
        name: data.name,
        acquisitionCostClp: data.acquisitionCostClp,
        estimatedValueClp: data.estimatedValueClp ?? null,
        hasLien: data.hasLien ? 1 : 0,
        lienAmountClp: data.lienAmountClp ?? null,
        currency: data.currency,
        documentId: data.documentId ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await db.select().from(userAssets).where(eq(userAssets.id, id));
      res.status(201).json(mapRow(created));
    } catch (e) {
      logger.error({ err: e }, "POST /api/assets failed");
      res.status(500).json({ message: "Error al registrar activo." });
    }
  });

  // PUT /api/assets/:id — actualizar activo
  app.put("/api/assets/:id", apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const { id } = req.params;

      const parsed = updateAssetSchema.safeParse(req.body);
      if (!parsed.success) {
        const { message, field } = firstValidationError(parsed.error);
        return res.status(400).json({ message, field, errors: parsed.error.issues });
      }

      const existing = await db
        .select()
        .from(userAssets)
        .where(and(eq(userAssets.id, id), eq(userAssets.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ message: "Activo no encontrado." });
      }

      const data = parsed.data;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (data.type !== undefined) updates.type = data.type;
      if (data.name !== undefined) updates.name = data.name;
      if (data.acquisitionCostClp !== undefined)
        updates.acquisitionCostClp = data.acquisitionCostClp;
      if (Object.prototype.hasOwnProperty.call(data, "estimatedValueClp"))
        updates.estimatedValueClp = data.estimatedValueClp ?? null;
      if (data.hasLien !== undefined) updates.hasLien = data.hasLien ? 1 : 0;
      if (Object.prototype.hasOwnProperty.call(data, "lienAmountClp"))
        updates.lienAmountClp = data.lienAmountClp ?? null;
      if (data.currency !== undefined) updates.currency = data.currency;
      if (Object.prototype.hasOwnProperty.call(data, "documentId"))
        updates.documentId = data.documentId ?? null;
      if (Object.prototype.hasOwnProperty.call(data, "notes")) updates.notes = data.notes ?? null;

      await db.update(userAssets).set(updates).where(eq(userAssets.id, id));

      const [updated] = await db.select().from(userAssets).where(eq(userAssets.id, id));
      res.json(mapRow(updated));
    } catch (e) {
      logger.error({ err: e }, "PUT /api/assets/:id failed");
      res.status(500).json({ message: "Error al actualizar activo." });
    }
  });

  // DELETE /api/assets/:id — eliminar activo
  app.delete("/api/assets/:id", apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const { id } = req.params;

      const existing = await db
        .select()
        .from(userAssets)
        .where(and(eq(userAssets.id, id), eq(userAssets.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ message: "Activo no encontrado." });
      }

      await db.delete(userAssets).where(eq(userAssets.id, id));
      res.status(204).send();
    } catch (e) {
      logger.error({ err: e }, "DELETE /api/assets/:id failed");
      res.status(500).json({ message: "Error al eliminar activo." });
    }
  });

  // POST /api/assets/extract-inscripcion — prefill desde una inscripción CBR (PDF).
  // Tercer camino, aislado de los uploaders de cartola. NO crea el activo: sólo
  // devuelve el prefill para que el usuario revise y guarde por el path normal.
  app.post(
    "/api/assets/extract-inscripcion",
    apiLimiter,
    authenticate,
    async (req: Request, res: Response) => {
      const { documentUpload } = await import("./middleware/uploadMiddleware.js");
      documentUpload.single("file")(req, res, async (uploadErr: unknown) => {
        if (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : "Archivo inválido.";
          return res.status(400).json({ message: msg });
        }
        const file = (req as Request & { file?: { buffer: Buffer } }).file;
        if (!file) {
          return res.status(400).json({ message: "Se requiere un archivo PDF de la inscripción." });
        }
        try {
          const { extractInscripcionFromBuffer } =
            await import("./parsers/inscripcionExtractor.js");
          const { buildInscripcionResponse, createInscripcionJob, enqueueInscripcionOcr } =
            await import("./services/assets/inscripcionJobs.js");

          // Fast-path: intentar SÓLO la capa de texto (sin OCR). E102 (con texto)
          // responde 200 al toque, como hoy.
          const outcome = await extractInscripcionFromBuffer(file.buffer, { skipOcr: true });

          // Escaneado (texto vacío/escaso) → el OCR es lento (~200s, timeout). No
          // correrlo en el request: crear job, encolar el OCR y responder 202.
          if (outcome.needsOcr) {
            const userId = (req as AuthenticatedRequest).user!.userId;
            const jobId = await createInscripcionJob(userId);
            enqueueInscripcionOcr(jobId, file.buffer);
            return res.status(202).json({ jobId, status: "processing" });
          }

          // Capa de texto suficiente (o sin campos útiles) → prefill / manual, como hoy.
          return res.json(await buildInscripcionResponse(outcome));
        } catch (e) {
          logger.error({ err: e }, "POST /api/assets/extract-inscripcion failed");
          return res.status(500).json({ message: "Error al procesar la inscripción." });
        }
      });
    },
  );

  // GET /api/assets/extract-inscripcion/:jobId — polling del job de OCR async.
  // Sólo el dueño (otro usuario → 404, sin filtrar existencia).
  app.get(
    "/api/assets/extract-inscripcion/:jobId",
    apiLimiter,
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = authReq.user!.userId;
        const { jobId } = req.params;
        const { getInscripcionJob } = await import("./services/assets/inscripcionJobs.js");
        const job = await getInscripcionJob(jobId, userId);
        if (!job) return res.status(404).json({ message: "Procesamiento no encontrado." });
        return res.json({ status: job.status, result: job.result, message: job.message });
      } catch (e) {
        logger.error({ err: e }, "GET /api/assets/extract-inscripcion/:jobId failed");
        return res.status(500).json({ message: "Error al consultar el procesamiento." });
      }
    },
  );

  logger.info("💰 Assets routes registered");
}

function mapRow(row: typeof userAssets.$inferSelect | any) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    name: row.name,
    acquisitionCostClp: row.acquisitionCostClp,
    estimatedValueClp: row.estimatedValueClp ?? null,
    hasLien: row.hasLien === 1 || row.hasLien === true,
    lienAmountClp: row.lienAmountClp ?? null,
    currency: row.currency,
    documentId: row.documentId ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
