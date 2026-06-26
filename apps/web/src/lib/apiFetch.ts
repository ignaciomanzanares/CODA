/**
 * Cliente fetch para rutas /api (login, registro, etc.) sin sesión.
 * En error HTTP, lanza ApiError con status + mensaje legible del backend.
 */

/** Error con metadata HTTP para que los callers puedan diferenciar por status. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

import { dispatchSessionExpired } from './authEvents';

function messageFromErrorBody(text: string, status: number): string {
  const trimmed = text?.trim() ?? "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed) as { message?: string; error?: string | unknown };
      if (typeof j.message === "string" && j.message.trim()) {
        return j.message.trim();
      }
      if (typeof j.error === "string" && j.error.trim()) {
        return j.error.trim();
      }
      if (j.error && typeof j.error === "object") {
        const nested = j.error as { message?: string };
        if (typeof nested.message === "string" && nested.message.trim()) {
          return nested.message.trim();
        }
      }
    } catch {
      /* no es JSON válido */
    }
  }
  if (status === 401) {
    return "No se pudo iniciar sesión. Revisa tu correo y contraseña.";
  }
  if (status === 403) {
    return "No tienes permiso para esta acción.";
  }
  if (status === 404) {
    return "No encontrado.";
  }
  if (status >= 500) {
    return "Error del servidor. Intenta más tarde.";
  }
  return trimmed ? trimmed.slice(0, 300) : `Error ${status}`;
}

/** Default timeout for API requests (45s to survive Render cold starts). */
const DEFAULT_TIMEOUT_MS = 45_000;

export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const apiBase =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ||
    "";

  let url: RequestInfo = input;
  if (typeof input === "string") {
    if (input.startsWith("/api")) {
      url = apiBase ? `${apiBase.replace(/\/$/, "")}${input}` : input;
    } else if (apiBase && !/^https?:\/\//i.test(input)) {
      url = `${apiBase.replace(/\/$/, "")}/${input.replace(/^\//, "")}`;
    }
  }

  // Timeout via AbortController (skip if caller already provides a signal)
  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  // credentials: "include" envía la cookie de sesión httpOnly cuando exista
  // (Fase B futura). Hoy no hay cookie y el Bearer sigue siendo el transporte real;
  // el CORS del API ya responde Access-Control-Allow-Credentials: true. El caller
  // puede sobreescribirlo vía `init.credentials`.
  const fetchInit: RequestInit = { credentials: "include", ...init };
  if (!fetchInit.signal) {
    controller = new AbortController();
    fetchInit.signal = controller.signal;
    timeoutId = setTimeout(() => controller!.abort(), DEFAULT_TIMEOUT_MS);
  }

  let res: Response;
  try {
    res = await fetch(url as RequestInfo, fetchInit);
  } catch (e) {
    if (controller?.signal.aborted) {
      throw new ApiError(
        "El servidor tardó demasiado en responder. Puede estar iniciándose — intenta de nuevo en 30 segundos.",
        0,
      );
    }
    // Network-level failure (CORS, DNS, offline)
    const detail = e instanceof Error ? e.message : "";
    console.error("[apiFetch] network error:", detail, "url:", url);
    throw new ApiError(
      `No podemos conectar con el servidor. Revisa tu conexión. (${detail})`,
      0,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    if (res.status === 401) dispatchSessionExpired(String(url));
    const msg = messageFromErrorBody(text, res.status);
    console.error(`[apiFetch] HTTP ${res.status}:`, msg, "url:", url);
    throw new ApiError(msg, res.status);
  }
  const trimmed = text.trim();
  // Sin VITE_API_URL, /api/* en el dominio del front suele devolver index.html (200) → no es la API real.
  const looksLikeHtml =
    trimmed.startsWith("<!") ||
    trimmed.toLowerCase().startsWith("<!doctype") ||
    /^<html[\s>]/i.test(trimmed);
  if (looksLikeHtml) {
    throw new Error(
      "La app no está hablando con el backend (se recibió HTML en lugar de JSON). En Vercel, define VITE_API_URL con la URL del API en Render y vuelve a desplegar el frontend."
    );
  }
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(
      "Respuesta del servidor no válida (no es JSON). Revisa VITE_API_URL y que el API esté en marcha."
    );
  }
}
