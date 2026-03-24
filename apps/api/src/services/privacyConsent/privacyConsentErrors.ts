/**
 * Errores de Postgres al usar tablas de consentimiento (migración pendiente en prod).
 */

export function isMissingPrivacyTableError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code === '42P01') return true;
  const m = typeof err?.message === 'string' ? err.message : '';
  return m.includes('does not exist') && m.includes('privacy_consent');
}
