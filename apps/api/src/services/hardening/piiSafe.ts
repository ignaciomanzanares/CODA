/**
 * D8 — Redactor de PII para logs. "Logs sin PII": antes de loggear un objeto de un conector
 * (que puede traer RUT, clave, tokens), pasarlo por `redactPii` para enmascarar los campos
 * sensibles por su NOMBRE de clave. RUT y email se enmascaran preservando algo de contexto para
 * debug; el resto se reemplaza por "[redacted]".
 */

/** Substrings de clave que marcan un campo como sensible (case-insensitive). */
const PII_KEY_HINTS = [
  "password",
  "passwordhash",
  "clave",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "backupcodes",
  "totpsecret",
  "credential",
  "rut",
  "email",
  "ssn",
];

export function isPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  return PII_KEY_HINTS.some((h) => k.includes(h));
}

/** Enmascara un RUT dejando solo el dígito verificador: "12.345.678-9" → "***-9". */
export function redactRut(rut: string): string {
  const s = String(rut).trim();
  const dash = s.lastIndexOf("-");
  if (dash > 0) return `***-${s.slice(dash + 1)}`;
  return s.length <= 1 ? "***" : `***${s.slice(-1)}`;
}

/** Enmascara un email: "camila@correo.cl" → "c***@correo.cl". */
export function redactEmail(email: string): string {
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

function redactByKey(key: string, value: unknown): unknown {
  const k = key.toLowerCase();
  if (typeof value === "string") {
    if (k.includes("rut")) return redactRut(value);
    if (k.includes("email")) return redactEmail(value);
  }
  return "[redacted]";
}

/**
 * Devuelve una copia del valor con los campos PII enmascarados (recursivo). No muta el original.
 * `extraKeys` agrega nombres de clave adicionales a tratar como sensibles.
 */
export function redactPii<T>(value: T, extraKeys: string[] = []): T {
  const extra = extraKeys.map((k) => k.toLowerCase());
  const sensitive = (key: string) => isPiiKey(key) || extra.includes(key.toLowerCase());

  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
        out[key] = sensitive(key) ? redactByKey(key, val) : walk(val);
      }
      return out;
    }
    return v;
  };

  return walk(value) as T;
}
