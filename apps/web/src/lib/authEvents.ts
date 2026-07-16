/**
 * Global session-expiry event.
 *
 * Any fetch layer that receives a 401 calls dispatchSessionExpired().
 * SessionExpiryGuard listens for the event, shows a Spanish toast, saves the
 * current route to sessionStorage, and redirects to /iniciar-sesion.
 *
 * Login endpoints are explicitly excluded — those 401s are user-facing
 * credential errors, not expired sessions.
 *
 * If there's an active personal session — a legacy token in localStorage OR a
 * cookie-hydrated user (C2 cookie-first, no token) — the 401 is likely from a
 * background/non-critical request (e.g. a new route not yet deployed). In that
 * case we skip the redirect to avoid kicking the user out mid-session; the real
 * session-expiry redirect is driven by the /me hydration + ProtectedRoute.
 */

import { hasPersonalSession } from "./authSession";

// /me también excluido: su 401 significa "no hay sesión" (sonda de hidratación
// cookie-first que corre incluso en el login) — sin esto, todo visitante sin
// sesión veía el toast "Sesión expirada" al abrir la página. La expiración real
// en páginas protegidas la despacha ProtectedRoute.
const AUTH_ENDPOINT_RE = /\/api\/auth\/(login|2fa\/verify|me\b)/;

/** Fire the session-expired event unless the failing URL is a login/hydration
 *  endpoint or there is an active (cookie-hydrated) personal session. */
export function dispatchSessionExpired(requestUrl: string): void {
  if (AUTH_ENDPOINT_RE.test(requestUrl)) return;

  // Sesión personal activa cookie-hidratada → tratamos el 401 como fallo
  // transitorio/de fondo y no expulsamos al usuario. Un `jwt_token` legacy ya NO
  // cuenta como sesión: post-C3 los datos van cookie-only, así que un token viejo
  // sin cookie no debe bloquear el redirect (causaba sesiones "stale").
  if (hasPersonalSession()) return;

  window.dispatchEvent(new CustomEvent("coda:session:expired"));
}
