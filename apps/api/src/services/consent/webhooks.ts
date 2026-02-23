/**
 * Webhooks para notificaciones de cambio de estado del consentimiento en el banco (IPI).
 * El banco puede enviar POST cuando el usuario autoriza, rechaza o revoca en su AS.
 * En producción: verificar firma/secret del webhook según documentación del directorio SFA.
 */

import { getConsentService } from './consentService.js';
import type { ConsentWebhookPayload } from './types.js';

/**
 * Procesa el payload enviado por el banco al cambiar el estado de un consentimiento.
 * Retorna el grant actualizado o null si no se encuentra o el payload es inválido.
 */
export async function handleConsentWebhook(payload: unknown): Promise<{ success: boolean; grant?: unknown; error?: string }> {
  const body = payload as ConsentWebhookPayload;
  if (!body || typeof body.externalGrantId !== 'string' || typeof body.status !== 'string') {
    return { success: false, error: 'invalid_payload' };
  }
  const service = getConsentService();
  const grant = await service.handleWebhook(body);
  if (!grant) {
    return { success: false, error: 'grant_not_found' };
  }
  return { success: true, grant };
}
