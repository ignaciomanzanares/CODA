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
 * If the user still has a token in localStorage, the 401 is likely from a
 * background/non-critical request (e.g. a new route not yet deployed).
 * In that case we skip the redirect to avoid kicking the user out mid-session.
 */

const AUTH_ENDPOINT_RE = /\/api\/auth\/(login|2fa\/verify)/;
const TOKEN_KEY = 'jwt_token';

/** Fire the session-expired event unless the failing URL is a login endpoint
 *  or the user still has a valid local token (background request failure). */
export function dispatchSessionExpired(requestUrl: string): void {
  if (AUTH_ENDPOINT_RE.test(requestUrl)) return;

  // If local token still present, the 401 is likely a transient/background
  // failure, not an actual session expiry. Don't kick the user out.
  if (localStorage.getItem(TOKEN_KEY)) return;

  window.dispatchEvent(new CustomEvent('coda:session:expired'));
}
