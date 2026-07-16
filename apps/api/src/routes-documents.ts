import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";

import { authenticate, ensureUserForToken, type AuthenticatedRequest } from "./middleware/auth.js";
import { uploadLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./logger.js";

export async function registerDocumentsRoutes(app: Express): Promise<void> {
  const { documentUpload, handleMulterError } = await import("./middleware/uploadMiddleware.js");
  app.post(
    "/api/documents/upload",
    authenticate,
    uploadLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      documentUpload.single("document")(req, res, (err: unknown) => {
        if (err) {
          const errorMessage = handleMulterError(err);
          return res.status(400).json({
            message: errorMessage,
            step: "validation",
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;

      try {
        // 1. Ensure user exists
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) {
          return res.status(404).json({
            message: "Usuario no encontrado. Inicia sesión de nuevo o regístrate.",
            step: "auth",
          });
        }

        // 2. Validate file presence
        const file = (req as { file?: Express.Multer.File }).file;
        if (!file?.buffer) {
          return res.status(400).json({
            message: "No se recibió ningún archivo. Usa el campo 'document'.",
            step: "validation",
          });
        }

        // 3. Enhanced validation
        const { validateDocument } = await import("./services/documents/documentValidator.js");
        const validation = validateDocument({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        });

        if (!validation.valid) {
          logger.warn(
            { userId, filename: file.originalname, errors: validation.errors },
            "[Upload] Validation failed",
          );
          return res.status(400).json({
            message: validation.errors.join(" "),
            errors: validation.errors,
            warnings: validation.warnings,
            step: "validation",
          });
        }

        // Log warnings if any
        if (validation.warnings && validation.warnings.length > 0) {
          logger.warn({ userId, warnings: validation.warnings }, "[Upload] Validation warnings");
        }

        // 3.5 Persistir el ORIGINAL cifrado con TTL (#21). Best-effort: si falla, el upload sigue.
        try {
          const { storeOriginal } = await import("./services/documents/originalStore.js");
          await storeOriginal(userId, file.buffer, {
            contentType: file.mimetype,
            filename: file.originalname,
          });
        } catch (origErr) {
          logger.warn(
            { err: origErr, userId },
            "[Upload] no se pudo persistir el original (no fatal)",
          );
        }

        // 4. Process document — en cola (BullMQ) si hay Redis configurado, para no bloquear el
        // request HTTP con OCR/parseo PDF + scoring; si no, igual que antes (síncrono).
        const { documentQueue } = await import("./queues/documentQueue.js");
        if (documentQueue) {
          const job = await documentQueue.add("upload", {
            userId,
            fileBase64: file.buffer.toString("base64"),
          });
          return res.status(202).json({
            step: "queued",
            jobId: job.id,
            metadata: {
              originalName: file.originalname,
              size: file.size,
              uploadedAt: new Date().toISOString(),
            },
            warnings: validation.warnings,
          });
        }

        const { processDocumentUpload } = await import("./services/documents/index.js");
        const result = await processDocumentUpload(userId, file.buffer);

        if (result.error) {
          logger.warn(
            { userId, error: result.error, step: result.step },
            "[Upload] Document processing failed",
          );
          return res.status(400).json({
            message: result.error,
            step: result.step,
            warnings: validation.warnings,
          });
        }

        // 5. Success response with warnings (validación del archivo + best-effort del score)
        res.json({
          ...result,
          warnings: [...(validation.warnings ?? []), ...(result.warnings ?? [])],
          metadata: {
            originalName: file.originalname,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error procesando documento";

        // Specific error handling
        if (msg.includes("password") || msg.includes("encrypted") || msg.includes("protected")) {
          return res.status(400).json({
            message: "El PDF está protegido o encriptado. Usa un documento sin contraseña.",
            step: "extraction",
          });
        }

        if (msg.includes("Invalid PDF")) {
          return res.status(400).json({
            message: "El archivo no es un PDF válido. Verifica que no esté corrupto.",
            step: "extraction",
          });
        }

        // Generic error
        logger.error({ err: e, userId: authReq.user?.userId }, "Document upload failed");
        res.status(500).json({
          message: "Error al procesar el documento. Intenta de nuevo o contacta soporte.",
          step: "processing",
        });
      }
    },
  );

  // GET /api/documents/upload/:jobId — polling de estado para uploads encolados (ver POST arriba).
  // Solo aplica cuando hay Redis configurado; sin Redis el POST ya responde con el resultado final.
  app.get("/api/documents/upload/:jobId", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { documentQueue } = await import("./queues/documentQueue.js");
      if (!documentQueue) {
        return res.status(404).json({ message: "No hay cola de procesamiento configurada." });
      }

      const job = await documentQueue.getJob(req.params.jobId);
      if (!job || job.data.userId !== userId) {
        return res.status(404).json({ message: "Job no encontrado." });
      }

      const state = await job.getState();
      if (state === "completed") {
        return res.json({ step: "done", state, result: job.returnvalue });
      }
      if (state === "failed") {
        return res.status(500).json({ step: "processing", state, message: job.failedReason });
      }
      return res.json({ step: "queued", state });
    } catch (e) {
      logger.error(
        { err: e, userId: authReq.user?.userId },
        "Document upload job status check failed",
      );
      res.status(500).json({ message: "Error al consultar el estado del documento." });
    }
  });

  // DELETE /api/documents — clear all movement documents (documentUploads table only)
  // DELETE /api/documents — "borrar todo": deja al usuario en estado limpio.
  // Elimina documentos (cartolas + CMF), sus PDFs originales cifrados, TODAS las
  // transacciones/cuentas/balances derivados y los scores calculados. Los datos
  // ingresados a mano (activos, metas, perfil) se conservan — los activos solo
  // sueltan la referencia al documento de respaldo.
  app.delete("/api/documents", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { db, accounts, transactions, balances, userAssets, eq, inArray } =
        await import("./db/index.js");
      if (db) {
        const userAccounts = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.userId, userId));
        const accountIds = userAccounts.map((a: { id: number }) => a.id);
        if (accountIds.length > 0) {
          await db.delete(transactions).where(inArray(transactions.accountId, accountIds));
          await db.delete(balances).where(inArray(balances.accountId, accountIds));
          await db.delete(accounts).where(eq(accounts.userId, userId));
        }
        // user_assets.document_id referencia document_uploads (FK sin cascade):
        // soltar la referencia antes de borrar los documentos.
        await db.update(userAssets).set({ documentId: null }).where(eq(userAssets.userId, userId));
      }

      await storage.deleteAllScoreDocumentUploads(userId).catch(() => {});
      await storage.deleteAllDocumentUploads(userId);

      // Scores derivados de los documentos recién borrados.
      await storage.deleteTransactionalScore(userId).catch(() => {});
      await storage.deleteCreditScore(userId).catch(() => {});

      // PDFs originales cifrados (stored_blobs) — sin esto el PII persiste.
      const { deleteOriginalsForUser } = await import("./services/documents/originalStore.js");
      await deleteOriginalsForUser(userId).catch(() => {});

      res.json({
        success: true,
        message: "Documentos, movimientos, cuentas y scores eliminados.",
      });
    } catch (e) {
      logger.error({ err: e, userId: authReq.user?.userId }, "Delete document uploads failed");
      res.status(500).json({ message: "Error al eliminar movimientos." });
    }
  });

  // DELETE /api/score/documents — clear all score documents AND score results for the user
  app.delete("/api/score/documents", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      // Cascada: las transacciones normalizadas tienen source_document_id apuntando al
      // score doc; hay que borrarlas ANTES de borrar los score docs para no dejar
      // transacciones huérfanas (cuenta vacía → inactiva, no se borra la cuenta).
      const { deleteTransactionsForDocument } =
        await import("./services/documents/normalizeCartola.js");
      const scoreDocs = await storage.listScoreDocumentUploadsByType(userId, "cartola");
      for (const s of scoreDocs) await deleteTransactionsForDocument(userId, s.id).catch(() => {});
      // Delete score documents + transactional score + credit score atomically
      await Promise.all([
        storage.deleteAllScoreDocumentUploads(userId),
        storage.deleteTransactionalScore(userId),
        storage.deleteCreditScore(userId),
      ]);
      res.json({ success: true, message: "Datos del Score eliminados." });
    } catch (e) {
      logger.error({ err: e, userId: authReq.user?.userId }, "Delete score documents failed");
      res.status(500).json({ message: "Error al eliminar datos del Score." });
    }
  });

  // GET /api/score/documents/count — count of score documents for the user
  app.get("/api/score/documents/count", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      const count = await storage.countScoreDocumentUploads(userId);
      res.json({ count });
    } catch (e) {
      logger.error({ err: e }, "Count score documents failed");
      res.status(500).json({ message: "Error al contar documentos." });
    }
  });

  // GET /api/transactions/parsed — all transactions extracted from uploaded cartola documents
}
