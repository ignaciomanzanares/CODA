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

import { hasPersonalSession } from './auth';

const AUTH_ENDPOINT_RE = /\/api\/auth\/(login|2fa\/verify)/;
const TOKEN_KEY = 'jwt_token';

/** Fire the session-expired event unless the failing URL is a login endpoint
 *  or there is an active personal session (legacy token or cookie-hydrated). */
export function dispatchSessionExpired(requestUrl: string): void {
  if (AUTH_ENDPOINT_RE.test(requestUrl)) return;

  // Sesión personal activa (token legacy o cookie-hidratada) → tratamos el 401
  // como fallo transitorio/de fondo y no expulsamos al usuario.
  if (localStorage.getItem(TOKEN_KEY) || hasPersonalSession()) return;

  window.dispatchEvent(new CustomEvent('coda:session:expired'));
}
