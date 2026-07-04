/**
 * Lógica de la API de leads para instituciones (Fase 2).
 *
 * Una institución (autenticada por API key → `provider`) ve y responde SOLO los leads de sus
 * propios productos. El payload entregado es SEUDONIMIZADO: sin PII directa del usuario (nada de
 * email/nombre/RUT/userId), solo el producto, el monto/plazo solicitados y la fecha — consistente
 * con el principio "no compartimos datos individuales" del expediente CMF.
 */
import { db, productApplications, financialProducts, eq, and, inArray, desc } from '../../db/index.js';
import { updateApplicationStatus, type ApplicationStatus } from '../products/leadTrackingService.js';
import { logger } from '../../logger.js';

export interface InstitutionLead {
  leadId: number;
  status: string;
  product: { id: number; name: string; category: string };
  requestedAmount: number | null;
  term: number | null;
  purpose: string | null;
  appliedAt: string;
}

/** Estados de un lead que aún esperan respuesta de la institución. */
const OPEN_STATUSES = ['pending', 'delivered', 'accepted'];

/**
 * Lista los leads abiertos de los productos de `provider`. Al entregarlos, marca los que estaban
 * en 'pending' como 'delivered' (transición de estado — la institución ya los recibió).
 */
export async function getLeadsForInstitution(provider: string): Promise<InstitutionLead[]> {
  const rows = await db
    .select({
      leadId: productApplications.id,
      status: productApplications.status,
      applicationData: productApplications.applicationData,
      appliedAt: productApplications.appliedAt,
      productId: financialProducts.id,
      productName: financialProducts.productName,
      category: financialProducts.category,
    })
    .from(productApplications)
    .innerJoin(financialProducts, eq(productApplications.productId, financialProducts.id))
    .where(and(eq(financialProducts.provider, provider), inArray(productApplications.status, OPEN_STATUSES)))
    .orderBy(desc(productApplications.appliedAt));

  // Marcar como 'delivered' los que estaban 'pending' (ya se los llevó la institución).
  const pendingIds = rows.filter((r: { status: string }) => r.status === 'pending').map((r: { leadId: number }) => r.leadId);
  if (pendingIds.length > 0) {
    await db
      .update(productApplications)
      .set({ status: 'delivered', updatedAt: new Date().toISOString() })
      .where(and(inArray(productApplications.id, pendingIds), eq(productApplications.status, 'pending')));
  }

  return rows.map((r: {
    leadId: number; status: string; applicationData: string | null; appliedAt: string;
    productId: number; productName: string; category: string;
  }) => {
    let requestedAmount: number | null = null;
    let term: number | null = null;
    let purpose: string | null = null;
    if (r.applicationData) {
      try {
        const d = JSON.parse(r.applicationData) as { requestedAmount?: number; term?: number; purpose?: string };
        requestedAmount = typeof d.requestedAmount === 'number' ? d.requestedAmount : null;
        term = typeof d.term === 'number' ? d.term : null;
        purpose = typeof d.purpose === 'string' ? d.purpose : null;
      } catch {
        /* applicationData no-JSON: se omite */
      }
    }
    return {
      leadId: r.leadId,
      // Si acabamos de marcarlo delivered, reflejarlo en la respuesta.
      status: pendingIds.includes(r.leadId) ? 'delivered' : r.status,
      product: { id: r.productId, name: r.productName, category: r.category },
      requestedAmount,
      term,
      purpose,
      appliedAt: r.appliedAt,
    };
  });
}

export type LeadResponseStatus = 'accepted' | 'rejected' | 'originated';

/**
 * Registra la respuesta de la institución a un lead. Verifica que el lead pertenezca a un producto
 * de `provider` (una institución no puede responder leads de otra). 'originated' genera success fee.
 * Devuelve false si el lead no existe o no pertenece a la institución.
 */
export async function respondToLead(
  provider: string,
  leadId: number,
  status: LeadResponseStatus,
  originatedAmount?: number,
  externalApplicationId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ appId: productApplications.id, productId: financialProducts.id, provider: financialProducts.provider })
    .from(productApplications)
    .innerJoin(financialProducts, eq(productApplications.productId, financialProducts.id))
    .where(eq(productApplications.id, leadId))
    .limit(1);

  if (!row || row.provider !== provider) {
    return false;
  }

  const [product] = await db.select().from(financialProducts).where(eq(financialProducts.id, row.productId)).limit(1);

  // 'originated' (desembolsado) → 'approved' internamente (dispara el success fee).
  const internalStatus: ApplicationStatus = status === 'originated' ? 'approved' : status;
  await updateApplicationStatus(leadId, internalStatus, product, originatedAmount, externalApplicationId);

  logger.info({ provider, leadId, status, originatedAmount }, '[institutionLeads] respuesta de institución registrada');
  return true;
}
