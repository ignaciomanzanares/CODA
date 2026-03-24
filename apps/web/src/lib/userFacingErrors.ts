/** Mensaje unificado para fallos de red / fetch en la app (no auth). */
export const USER_FACING_CONNECTION_ERROR =
  "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.";

/** Mensaje corto para login / apiFetch sin sesión. */
export const AUTH_CONNECTION_ERROR = "Problema de conexión. Verifica tu internet.";

/**
 * Errores de login/2FA: mensajes amigables, sin depender del texto exacto del backend.
 */
export function mapLoginAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    raw.includes("NetworkError") ||
    raw.includes("Failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("load failed") ||
    raw.includes(AUTH_CONNECTION_ERROR) ||
    raw.includes("Problema de conexión. Intenta de nuevo.") ||
    raw.includes("No se pudo conectar con el servidor")
  ) {
    return "Problema de conexión. Intenta de nuevo.";
  }

  if (raw.includes("La contraseña no es correcta")) {
    return "La contraseña no es correcta.";
  }

  if (
    raw.includes("No encontramos una cuenta") ||
    raw.includes("No hay una cuenta") ||
    raw.includes("user_not_found")
  ) {
    return "No encontramos una cuenta con ese correo.";
  }

  if (raw.includes("Esta cuenta usa otro método") || raw.includes("no_password")) {
    return "Esta cuenta usa otro método de acceso.";
  }

  if (raw.includes("No se pudo enviar el código")) {
    return "Problema de conexión. Intenta de nuevo.";
  }

  if (raw.includes("Invalid response") || raw === "Unauthorized") {
    return "No pudimos iniciar sesión. Intenta de nuevo.";
  }

  // 2FA (mensajes en inglés desde la API)
  if (raw.includes("Invalid verification code")) {
    return "El código no es válido.";
  }
  if (raw.includes("Verification code expired")) {
    return "El código expiró. Solicita uno nuevo.";
  }
  if (raw.includes("No verification code found")) {
    return "No hay código activo. Solicita uno nuevo.";
  }
  if (raw.includes("Too many attempts")) {
    return "Demasiados intentos. Solicita un nuevo código.";
  }
  if (raw.includes("User not found")) {
    return "No encontramos una cuenta con ese correo.";
  }
  if (raw.includes("Verification failed")) {
    return "Problema de conexión. Intenta de nuevo.";
  }

  return "No pudimos iniciar sesión. Intenta de nuevo.";
}

function isLikelyNetworkErrorMessage(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    raw.includes("NetworkError") ||
    raw.includes("Failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("load failed") ||
    raw.includes(USER_FACING_CONNECTION_ERROR) ||
    raw.includes(AUTH_CONNECTION_ERROR) ||
    raw.includes("Problema de conexión. Verifica tu internet.")
  );
}

export function extractApiErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string" && b.message.trim()) return b.message.trim();
  if (typeof b.error === "string" && b.error.trim()) return b.error.trim();
  return "";
}

/**
 * Para toasts / inline en metas, gastos, etc.: nunca raw JSON ni NetworkError.
 */
export function mapUserFacingApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === "User not authenticated") {
    return "Debes iniciar sesión para continuar.";
  }
  if (isLikelyNetworkErrorMessage(raw)) {
    return USER_FACING_CONNECTION_ERROR;
  }
  if (raw === "[object Object]" || raw.trim() === "") {
    return USER_FACING_CONNECTION_ERROR;
  }
  if (raw.startsWith("{") && raw.includes('"')) {
    return USER_FACING_CONNECTION_ERROR;
  }
  return raw;
}
