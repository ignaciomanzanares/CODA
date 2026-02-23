/**
 * Rutas del Panel de Control de Consentimientos (RAR + Grant Management).
 * GET/POST /api/consent, GET /api/consent/:id, POST /api/consent/:id/revoke, POST /api/consent/webhook.
 */

import type { Express, Request, Response } from 'express';
import { Router } from 'express';
import { getConsentService } from './services/consent/index.js';
import { handleConsentWebhook } from './services/consent/webhooks.js';
import type { AuthenticatedRequest } from './middleware/auth.js';
import { authenticate } from './middleware/auth.js';
import { validateBody, validateParams } from './middleware/validation.js';
import { z } from 'zod';
import { logger } from './logger.js';

const createConsentSchema = z.object({
  resourceTypes: z.array(z.enum(['account_information', 'products_vigentes', 'historical_positions', 'terms_and_conditions', 'payment_initiation'])).min(1),
  purpose: z.string().max(300).optional(),
  externalGrantId: z.string().nullable().optional(),
  ipiId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

const webhookSchema = z.object({
  externalGrantId: z.string(),
  status: z.enum(['pending', 'authorized', 'rejected', 'revoked', 'expired']),
  ipiId: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});

const idParamSchema = z.object({ id: z.string().regex(/^\d+$/).transform(Number) });

export function registerConsentRoutes(app: Express): void {
  const router = Router();
  const consentService = getConsentService();

  /** Lista consentimientos del usuario (Panel de Control). */
  router.get('/', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
      const grants = await consentService.listByUser(userId);
      return res.json(grants);
    } catch (e) {
      logger.error({ err: e }, 'List consent grants failed');
      return res.status(500).json({ message: 'Error listing consent grants' });
    }
  });

  /** Crea un nuevo consentimiento (estado pending). */
  router.post('/', authenticate, validateBody(createConsentSchema), async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
      const body = req.body as z.infer<typeof createConsentSchema>;
      const grant = await consentService.create({
        userId,
        resourceTypes: body.resourceTypes,
        purpose: body.purpose,
        externalGrantId: body.externalGrantId ?? undefined,
        ipiId: body.ipiId ?? undefined,
        expiresAt: body.expiresAt ?? undefined,
      });
      return res.status(201).json(grant);
    } catch (e) {
      logger.error({ err: e }, 'Create consent failed');
      return res.status(500).json({ message: 'Error creating consent' });
    }
  });

  /** Obtiene un consentimiento por id (solo del usuario). */
  router.get('/:id', authenticate, validateParams(idParamSchema), async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    const { id } = req.params as { id: string };
    const grantId = parseInt(id, 10);
    if (Number.isNaN(grantId)) {
      return res.status(400).json({ message: 'Invalid grant id' });
    }
    try {
      const grant = await consentService.getById(grantId, userId);
      if (!grant) {
        return res.status(404).json({ message: 'Consent grant not found' });
      }
      return res.json(grant);
    } catch (e) {
      logger.error({ err: e }, 'Get consent grant failed');
      return res.status(500).json({ message: 'Error fetching consent grant' });
    }
  });

  /** Revoca un consentimiento (usuario). */
  router.post('/:id/revoke', authenticate, validateParams(idParamSchema), async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    const { id } = req.params as { id: string };
    const grantId = parseInt(id, 10);
    if (Number.isNaN(grantId)) {
      return res.status(400).json({ message: 'Invalid grant id' });
    }
    try {
      const grant = await consentService.revoke(grantId, userId);
      if (!grant) {
        return res.status(404).json({ message: 'Consent grant not found or already revoked' });
      }
      return res.json(grant);
    } catch (e) {
      logger.error({ err: e }, 'Revoke consent failed');
      return res.status(500).json({ message: 'Error revoking consent' });
    }
  });

  /**
   * Webhook: notificación del banco cuando el consentimiento cambia de estado.
   * Sin autenticación JWT; en producción verificar firma/secret del IPI.
   */
  router.post('/webhook', async (req: Request, res: Response) => {
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid webhook payload', errors: parsed.error.flatten() });
    }
    try {
      const result = await handleConsentWebhook(parsed.data);
      if (!result.success) {
        return res.status(result.error === 'grant_not_found' ? 404 : 400).json({ message: result.error });
      }
      return res.json(result.grant);
    } catch (e) {
      logger.error({ err: e }, 'Consent webhook failed');
      return res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  app.use('/api/consent', router);
}
