/**
 * Cliente fetch para rutas /api (login, registro, etc.) sin sesión.
 * En error HTTP, lanza Error con el mensaje legible del backend (campo `message` en JSON).
 */

function messageFromErrorBody(text: string, status: number): string {
  const trimmed = text?.trim() ?? "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed) as { message?: string; error?: string };
      if (typeof j.message === "string" && j.message.trim()) {
        return j.message.trim();
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

  const res = await fetch(url as RequestInfo, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(messageFromErrorBody(text, res.status));
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}
