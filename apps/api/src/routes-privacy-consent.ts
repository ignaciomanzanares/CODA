/**
 * API de consentimientos por finalidad (CMF) — distinto de /api/consent (SFA).
 */

import type { Express, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from './middleware/auth.js';
import { authenticate } from './middleware/auth.js';
import { validateBody } from './middleware/validation.js';
import { logger } from './logger.js';
import {
  PRIVACY_POLICY_VERSION,
  REGISTRATION_REQUIRED_PURPOSES,
} from './services/privacyConsent/privacyConsentTypes.js';
import {
  getPurposeStates,
  listAuditTrail,
  acceptPurpose,
  revokePurpose,
} from './services/privacyConsent/privacyConsentService.js';

function clientMeta(req: Request): { ipAddress: string | null; userAgent: string | null; channel: string } {
  const xf = req.headers['x-forwarded-for'];
  const first = typeof xf === 'string' ? xf.split(',')[0]?.trim() : '';
  const ip =
    first ||
    (typeof req.socket?.remoteAddress === 'string' ? req.socket.remoteAddress : null) ||
    null;
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  return { ipAddress: ip, userAgent: ua, channel: 'web' };
}

const purposeSchema = z.object({
  purpose: z.enum([
    'data_processing',
    'open_banking',
    'scoring',
    'recommendations',
    'marketing',
    'origination_transfer',
  ]),
  policyVersion: z.string().min(1).max(32).optional(),
});

export function registerPrivacyConsentRoutes(app: Express): void {
  const router = Router();

  router.get('/', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const purposes = await getPurposeStates(userId);
      return res.json({
        policyVersion: PRIVACY_POLICY_VERSION,
        purposes,
      });
    } catch (e) {
      logger.error({ err: e }, 'privacy-consents GET failed');
      return res.status(500).json({ message: 'Error listing privacy consents' });
    }
  });

  router.get('/audit', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    try {
      const events = await listAuditTrail(userId, limit);
      return res.json({ policyVersion: PRIVACY_POLICY_VERSION, events });
    } catch (e) {
      logger.error({ err: e }, 'privacy-consents audit failed');
      return res.status(500).json({ message: 'Error listing audit trail' });
    }
  });

  router.post('/accept', authenticate, validateBody(purposeSchema), async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const body = req.body as z.infer<typeof purposeSchema>;
    const pv = body.policyVersion ?? PRIVACY_POLICY_VERSION;
    try {
      await acceptPurpose(userId, body.purpose, pv, clientMeta(req));
      const purposes = await getPurposeStates(userId);
      return res.json({ policyVersion: PRIVACY_POLICY_VERSION, purposes });
    } catch (e) {
      logger.error({ err: e }, 'privacy-consents accept failed');
      return res.status(500).json({ message: 'Error recording consent' });
    }
  });

  router.post('/revoke', authenticate, validateBody(purposeSchema), async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? '';
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const body = req.body as z.infer<typeof purposeSchema>;
    const pv = body.policyVersion ?? PRIVACY_POLICY_VERSION;
    if ((REGISTRATION_REQUIRED_PURPOSES as readonly string[]).includes(body.purpose)) {
      return res.status(403).json({
        message:
          'Estas finalidades son necesarias para prestar el servicio. Para dejar de autorizarlas, cierra tu cuenta o contacta a soporte.',
      });
    }
    try {
      await revokePurpose(userId, body.purpose, pv, clientMeta(req));
      const purposes = await getPurposeStates(userId);
      return res.json({ policyVersion: PRIVACY_POLICY_VERSION, purposes });
    } catch (e) {
      logger.error({ err: e }, 'privacy-consents revoke failed');
      return res.status(500).json({ message: 'Error revoking consent' });
    }
  });

  app.use('/api/privacy-consents', router);
}

export { PRIVACY_POLICY_VERSION };
