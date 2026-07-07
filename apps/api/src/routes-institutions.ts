/**
 * API de leads para instituciones financieras (Fase 2). Autenticada por API key (X-API-Key),
 * NO por el JWT de usuario. Cada institución ve/responde solo sus propios leads.
 */
import type { Express, Request, Response } from 'express';
import { apiLimiter } from './middleware/rateLimiter.js';
import {
  authenticateInstitution,
  type AuthenticatedInstitutionRequest,
} from './services/institutions/institutionAuth.js';
import {
  getLeadsForInstitution,
  respondToLead,
  type LeadResponseStatus,
} from './services/institutions/institutionLeads.js';
import { logger } from './logger.js';

const VALID_RESPONSES: LeadResponseStatus[] = ['accepted', 'rejected', 'originated'];

export function registerInstitutionRoutes(app: Express) {
  // GET /api/institutions/leads — leads abiertos de los productos de la institución (seudonimizados).
  app.get('/api/institutions/leads', apiLimiter, authenticateInstitution, async (req: Request, res: Response) => {
    const institution = (req as AuthenticatedInstitutionRequest).institution!;
    try {
      const leads = await getLeadsForInstitution(institution.provider);
      res.json({ provider: institution.provider, count: leads.length, leads });
    } catch (err) {
      logger.error({ err }, '[institutions] getLeads falló');
      res.status(500).json({ error: 'Error al obtener leads' });
    }
  });

  // POST /api/institutions/leads/:id/status — respuesta de la institución.
  app.post('/api/institutions/leads/:id/status', apiLimiter, authenticateInstitution, async (req: Request, res: Response) => {
    const institution = (req as AuthenticatedInstitutionRequest).institution!;
    const leadId = Number(req.params.id);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' });
    }
    const { status, originatedAmount, externalApplicationId } = (req.body ?? {}) as {
      status?: LeadResponseStatus;
      originatedAmount?: number;
      externalApplicationId?: string;
    };
    if (!status || !VALID_RESPONSES.includes(status)) {
      return res.status(400).json({ error: `status debe ser uno de: ${VALID_RESPONSES.join(', ')}` });
    }
    if (status === 'originated' && (typeof originatedAmount !== 'number' || originatedAmount <= 0)) {
      return res.status(400).json({ error: 'originated requiere originatedAmount > 0 (monto desembolsado)' });
    }
    try {
      const ok = await respondToLead(institution.provider, leadId, status, originatedAmount, externalApplicationId);
      if (!ok) {
        return res.status(404).json({ error: 'Lead no encontrado o no pertenece a tu institución' });
      }
      res.json({ ok: true, leadId, status });
    } catch (err) {
      logger.error({ err, leadId }, '[institutions] respondToLead falló');
      res.status(500).json({ error: 'Error al registrar la respuesta' });
    }
  });
}
