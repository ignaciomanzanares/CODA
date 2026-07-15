/**
 * Token CSRF de doble-submit (#10): el backend setea una cookie no-httpOnly
 * `coda_csrf` junto con la cookie de sesión httpOnly. El front la lee y la
 * reenvía como header `X-CSRF-Token` en mutaciones — así el servidor sabe que
 * la petición no vino de un sitio de terceros abusando la cookie de sesión.
 * Solo aplica cuando la sesión viaja por cookie; si ya hay `Authorization`,
 * el backend ni siquiera la exige.
 */

const CSRF_COOKIE_NAME = "coda_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === CSRF_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** Agrega el header CSRF a `headers` si el método muta estado y hay cookie CSRF disponible. */
export function withCsrfHeader(
  method: string | undefined,
  headers: Record<string, string>,
): Record<string, string> {
  if (!method || !MUTATING_METHODS.has(method.toUpperCase())) return headers;
  const token = readCsrfCookie();
  if (!token) return headers;
  return { ...headers, [CSRF_HEADER_NAME]: token };
}
