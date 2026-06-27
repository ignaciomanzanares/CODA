/**
 * Observabilidad del frontend (#27): inicializa Sentry SOLO si `VITE_SENTRY_DSN` está configurada
 * y el paquete `@sentry/react` está instalado. Es no-op por defecto — no agrega peso ni rompe el
 * build cuando no se usa.
 *
 * El import dinámico usa una variable + `@vite-ignore` para que Vite no intente resolver/bundlear
 * `@sentry/react` en build (mismo patrón opcional que el backend con `@sentry/node`). Para
 * activarlo: `npm i @sentry/react` y setear `VITE_SENTRY_DSN` (ver INTEGRATION_GUIDE.md).
 */
export async function initWebObservability(): Promise<void> {
  const dsn = (import.meta as unknown as { env?: { VITE_SENTRY_DSN?: string; MODE?: string } }).env?.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const pkg = '@sentry/react';
    const Sentry: any = await import(/* @vite-ignore */ pkg);
    Sentry.init({
      dsn,
      environment: (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ?? 'production',
      tracesSampleRate: 0,
      // No enviar PII por defecto.
      sendDefaultPii: false,
    });
  } catch {
    // Paquete no instalado o init falló → seguimos sin Sentry (no romper la app).
    if (typeof console !== 'undefined') {
      console.warn('[observability] VITE_SENTRY_DSN seteado pero @sentry/react no está instalado.');
    }
  }
}
