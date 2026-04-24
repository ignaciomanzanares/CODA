/**
 * Global session-expiry event.
 *
 * Any fetch layer that receives a 401 calls dispatchSessionExpired().
 * SessionExpiryGuard listens for the event, shows a Spanish toast, saves the
 * current route to sessionStorage, and redirects to /iniciar-sesion.
 *
 * Login endpoints are explicitly excluded — those 401s are user-facing
 * credential errors, not expired sessions.
 */

const AUTH_ENDPOINT_RE = /\/api\/auth\/(login|2fa\/verify)/;

/** Fire the session-expired event unless the failing URL is a login endpoint. */
export function dispatchSessionExpired(requestUrl: string): void {
  if (AUTH_ENDPOINT_RE.test(requestUrl)) return;
  window.dispatchEvent(new CustomEvent('coda:session:expired'));
}
