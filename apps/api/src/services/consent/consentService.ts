/**
 * ConsentService – Gestión del ciclo de vida del consentimiento SFA (RAR + Grant Management).
 * Alimenta el Panel de Control de Consentimientos del usuario.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db, consentGrants } from '../../db/index.js';
import type {
  CreateConsentInput,
  ConsentGrantStatus,
  ConsentGrantForPanel,
  ConsentWebhookPayload,
} from './types.js';
import {
  CONSENT_PURPOSE_CODA,
  CONSENT_PURPOSE_MAX_LENGTH,
  CONSENT_POLICY_VERSION,
} from './types.js';
import { buildAuthorizationDetails, serializeAuthorizationDetails, parseAuthorizationDetails } from './rar.js';

const VALID_STATUSES: ConsentGrantStatus[] = ['pending', 'authorized', 'rejected', 'revoked', 'expired'];

function isValidStatus(s: string): s is ConsentGrantStatus {
  return VALID_STATUSES.includes(s as ConsentGrantStatus);
}

function truncatePurpose(purpose: string): string {
  const p = purpose.trim();
  return p.length > CONSENT_PURPOSE_MAX_LENGTH ? p.slice(0, CONSENT_PURPOSE_MAX_LENGTH) : p;
}

export class ConsentService {
  /**
   * Crea un nuevo consentimiento (estado pending) con authorization_details granular.
   * purpose: descripción en español, máx. 300 caracteres; por defecto CONSENT_PURPOSE_CODA.
   */
  async create(input: CreateConsentInput): Promise<ConsentGrantForPanel> {
    const purpose = input.purpose ? truncatePurpose(input.purpose) : CONSENT_PURPOSE_CODA;
    const authorizationDetails = buildAuthorizationDetails(input.resourceTypes);
    const authorizationDetailsJson = serializeAuthorizationDetails(authorizationDetails);

    const [row] = await db
      .insert(consentGrants)
      .values({
        userId: input.userId,
        status: 'pending',
        authorizationDetails: authorizationDetailsJson,
        purpose,
        policyVersion: CONSENT_POLICY_VERSION,
        externalGrantId: input.externalGrantId ?? null,
        ipiId: input.ipiId ?? null,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();

    return mapToPanel(row as Record<string, unknown>);
  }

  /** Obtiene un consentimiento por id; verifica que pertenezca al userId si se indica. */
  async getById(grantId: number, userId?: string): Promise<ConsentGrantForPanel | null> {
    const conditions = userId
      ? and(eq(consentGrants.id, grantId), eq(consentGrants.userId, userId))
      : eq(consentGrants.id, grantId);
    const [row] = await db.select().from(consentGrants).where(conditions).limit(1);
    if (!row) return null;
    return mapToPanel(row);
  }

  /** Lista todos los consentimientos del usuario para el Panel de Control. */
  async listByUser(userId: string): Promise<ConsentGrantForPanel[]> {
    const rows = await db
      .select()
      .from(consentGrants)
      .where(eq(consentGrants.userId, userId))
      .orderBy(desc(consentGrants.updatedAt));
    return rows.map(mapToPanel);
  }

  /** Actualiza el estado del consentimiento (Grant Management). Usado por webhooks y revocación. */
  async updateStatus(
    grantId: number,
    status: ConsentGrantStatus,
    options?: { userId?: string; externalGrantId?: string }
  ): Promise<ConsentGrantForPanel | null> {
    if (!isValidStatus(status)) return null;
    const conditions = options?.userId
      ? and(eq(consentGrants.id, grantId), eq(consentGrants.userId, options.userId))
      : options?.externalGrantId
        ? eq(consentGrants.externalGrantId, options.externalGrantId)
        : eq(consentGrants.id, grantId);

    const [updated] = await db
      .update(consentGrants)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(conditions)
      .returning();

    return updated ? mapToPanel(updated) : null;
  }

  /**
   * Procesa notificación (webhook) del banco cuando el consentimiento cambia de estado.
   * Identificación por externalGrantId.
   */
  async handleWebhook(payload: ConsentWebhookPayload): Promise<ConsentGrantForPanel | null> {
    if (!payload.externalGrantId || !isValidStatus(payload.status)) return null;
    const [row] = await db
      .select()
      .from(consentGrants)
      .where(eq(consentGrants.externalGrantId, payload.externalGrantId))
      .limit(1);
    if (!row) return null;

    const updates: Record<string, unknown> = {
      status: payload.status,
      updatedAt: new Date().toISOString(),
    };
    if (payload.ipiId !== undefined) updates.ipiId = payload.ipiId;
    if (payload.expiresAt !== undefined) updates.expiresAt = payload.expiresAt;

    const [updated] = await db
      .update(consentGrants)
      .set(updates as any)
      .where(eq(consentGrants.id, (row as any).id))
      .returning();

    return updated ? mapToPanel(updated) : null;
  }

  /**
   * Asigna externalGrantId a un consentimiento (ej. para simulación: sim-{id}).
   * Permite que el webhook del banco identifique el grant después.
   */
  async setExternalGrantId(grantId: number, userId: string, externalGrantId: string): Promise<ConsentGrantForPanel | null> {
    const [updated] = await db
      .update(consentGrants)
      .set({
        externalGrantId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(consentGrants.id, grantId), eq(consentGrants.userId, userId)))
      .returning();
    return updated ? mapToPanel(updated as Record<string, unknown>) : null;
  }

  /** Revoca un consentimiento (por el usuario). */
  async revoke(grantId: number, userId: string): Promise<ConsentGrantForPanel | null> {
    return this.updateStatus(grantId, 'revoked', { userId });
  }

  /** Marca un consentimiento como expirado. */
  async expire(grantId: number, userId?: string): Promise<ConsentGrantForPanel | null> {
    return this.updateStatus(grantId, 'expired', userId ? { userId } : undefined);
  }

  /**
   * Genera el objeto authorization_details (RAR) para enviar al AS del banco.
   * Útil para el flujo de autorización en el frontend.
   */
  buildAuthorizationDetailsForTypes(resourceTypes: CreateConsentInput['resourceTypes']) {
    return buildAuthorizationDetails(resourceTypes);
  }
}

function mapToPanel(row: Record<string, unknown>): ConsentGrantForPanel {
  const authDetails = (row.authorizationDetails as string) ?? '[]';
  return {
    id: row.id as number,
    userId: row.userId as string,
    status: row.status as ConsentGrantStatus,
    scope: parseAuthorizationDetails(authDetails),
    purpose: (row.purpose as string) ?? '',
    policyVersion: (row.policyVersion as string) ?? CONSENT_POLICY_VERSION,
    externalGrantId: (row.externalGrantId as string) ?? null,
    ipiId: (row.ipiId as string) ?? null,
    expiresAt: (row.expiresAt as string) ?? null,
    createdAt: (row.createdAt as string) ?? '',
    updatedAt: (row.updatedAt as string) ?? '',
  };
}

let defaultService: ConsentService | null = null;

export function getConsentService(): ConsentService {
  if (!defaultService) defaultService = new ConsentService();
  return defaultService;
}
