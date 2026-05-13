import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from './middleware/auth.js';
import { db, userAssets } from './db/index.js';
import { logger } from './logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';

const createAssetSchema = z.object({
  type: z.enum(['property', 'vehicle', 'crypto', 'investment', 'other']),
  name: z.string().min(1).max(200),
  acquisitionCostClp: z.number().int().positive(),
  estimatedValueClp: z.number().int().positive().optional().nullable(),
  hasLien: z.boolean().default(false),
  lienAmountClp: z.number().int().positive().optional().nullable(),
  currency: z.string().default('CLP'),
  documentId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const updateAssetSchema = createAssetSchema.partial();

export function registerAssetsRoutes(app: Express): void {
  // GET /api/assets — lista activos del usuario
  app.get('/api/assets', apiLimiter, authenticate, async (req: Request, res: Response) => {
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
      logger.error({ err: e }, 'GET /api/assets failed');
      res.status(500).json({ message: 'Error al obtener activos.' });
    }
  });

  // GET /api/assets/summary — total consolidado por tipo
  app.get('/api/assets/summary', apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const rows = await db
        .select()
        .from(userAssets)
        .where(eq(userAssets.userId, userId));

      const byType: Record<string, number> = {};
      let declaradosClp = 0;
      for (const row of rows) {
        const value = row.estimatedValueClp ?? row.acquisitionCostClp;
        byType[row.type] = (byType[row.type] ?? 0) + value;
        declaradosClp += value;
      }

      res.json({ declaradosClp, byType, count: rows.length });
    } catch (e) {
      logger.error({ err: e }, 'GET /api/assets/summary failed');
      res.status(500).json({ message: 'Error al obtener resumen de activos.' });
    }
  });

  // POST /api/assets — registrar nuevo activo
  app.post('/api/assets', apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const parsed = createAssetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Datos inválidos.', errors: parsed.error.issues });
      }

      const data = parsed.data;
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
      logger.error({ err: e }, 'POST /api/assets failed');
      res.status(500).json({ message: 'Error al registrar activo.' });
    }
  });

  // PUT /api/assets/:id — actualizar activo
  app.put('/api/assets/:id', apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const { id } = req.params;

      const parsed = updateAssetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Datos inválidos.', errors: parsed.error.issues });
      }

      const existing = await db
        .select()
        .from(userAssets)
        .where(and(eq(userAssets.id, id), eq(userAssets.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ message: 'Activo no encontrado.' });
      }

      const data = parsed.data;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (data.type !== undefined) updates.type = data.type;
      if (data.name !== undefined) updates.name = data.name;
      if (data.acquisitionCostClp !== undefined) updates.acquisitionCostClp = data.acquisitionCostClp;
      if (Object.prototype.hasOwnProperty.call(data, 'estimatedValueClp')) updates.estimatedValueClp = data.estimatedValueClp ?? null;
      if (data.hasLien !== undefined) updates.hasLien = data.hasLien ? 1 : 0;
      if (Object.prototype.hasOwnProperty.call(data, 'lienAmountClp')) updates.lienAmountClp = data.lienAmountClp ?? null;
      if (data.currency !== undefined) updates.currency = data.currency;
      if (Object.prototype.hasOwnProperty.call(data, 'documentId')) updates.documentId = data.documentId ?? null;
      if (Object.prototype.hasOwnProperty.call(data, 'notes')) updates.notes = data.notes ?? null;

      await db.update(userAssets).set(updates).where(eq(userAssets.id, id));

      const [updated] = await db.select().from(userAssets).where(eq(userAssets.id, id));
      res.json(mapRow(updated));
    } catch (e) {
      logger.error({ err: e }, 'PUT /api/assets/:id failed');
      res.status(500).json({ message: 'Error al actualizar activo.' });
    }
  });

  // DELETE /api/assets/:id — eliminar activo
  app.delete('/api/assets/:id', apiLimiter, authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user!.userId;
      const { id } = req.params;

      const existing = await db
        .select()
        .from(userAssets)
        .where(and(eq(userAssets.id, id), eq(userAssets.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ message: 'Activo no encontrado.' });
      }

      await db.delete(userAssets).where(eq(userAssets.id, id));
      res.status(204).send();
    } catch (e) {
      logger.error({ err: e }, 'DELETE /api/assets/:id failed');
      res.status(500).json({ message: 'Error al eliminar activo.' });
    }
  });

  logger.info('💰 Assets routes registered');
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
