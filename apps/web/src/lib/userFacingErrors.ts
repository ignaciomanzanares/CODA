/** Mensaje unificado para fallos de red / fetch en la app (no auth). */
export const USER_FACING_CONNECTION_ERROR =
  "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.";

/** Mensaje corto para login / apiFetch sin sesión. */
export const AUTH_CONNECTION_ERROR = "Problema de conexión. Verifica tu internet.";

/**
 * Errores de login/2FA: mensajes amigables.
 * Usa ApiError.status cuando está disponible para clasificación precisa.
 */
export function mapLoginAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Log para diagnóstico (visible en DevTools de preview y desarrollo)
  console.error("[login] error capturado:", err);

  // Status-based classification (ApiError from apiFetch)
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") {
    if (status === 0) {
      // Network/timeout — apiFetch ya puso un mensaje descriptivo
      if (raw.includes("tardó demasiado")) {
        return "El servidor está despertando. Intenta de nuevo en unos segundos.";
      }
      return "No podemos conectar con el servidor. Revisa tu conexión.";
    }
    if (status === 429) {
      return "Demasiados intentos. Espera un momento.";
    }
    if (status >= 500) {
      return "El servidor está despertando. Intenta de nuevo en unos segundos.";
    }
  }

  // Message-based classification (for backward compat with plain Error)
  if (
    raw.includes("NetworkError") ||
    raw.includes("Failed to fetch") ||
    raw.toLowerCase().includes("fetch failed") ||
    raw.toLowerCase().includes("load failed") ||
    raw.includes(AUTH_CONNECTION_ERROR) ||
    raw.includes("No podemos conectar con el servidor")
  ) {
    return "No podemos conectar con el servidor. Revisa tu conexión.";
  }

  if (raw.includes("[migration_recovery]")) {
    return raw.replace(/^\[migration_recovery\]\s*/i, "").trim() || "Tras la migración del servidor debes definir tu contraseña con «Recuperar acceso» en la página de inicio de sesión.";
  }

  if (raw.includes("La contraseña no es correcta")) {
    return "Correo o contraseña incorrectos.";
  }

  if (
    raw.includes("No encontramos una cuenta") ||
    raw.includes("No hay una cuenta") ||
    raw.includes("user_not_found")
  ) {
    return "No encontramos una cuenta con ese correo.";
  }

  if (raw.includes("Revisa tu correo y contraseña") || (status === 401)) {
    return "Correo o contraseña incorrectos.";
  }

  if (raw.includes("Esta cuenta usa otro método") || raw.includes("no_password")) {
    return "Esta cuenta usa otro método de acceso.";
  }

  if (raw.includes("No se pudo enviar el código")) {
    return "Problema al enviar el código. Intenta de nuevo.";
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
    return "Error de verificación. Intenta de nuevo.";
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
