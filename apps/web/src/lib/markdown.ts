/**
 * Mini-markdown seguro para contenido generado por el LLM (asistente,
 * summaryBanner del plan) que se inyecta vía dangerouslySetInnerHTML.
 *
 * El escape es OBLIGATORIO y va primero: el texto viene del modelo (proxied
 * por el server) — sin escape, un prompt injection que haga emitir
 * `<img onerror=...>` ejecutaría script en la sesión del usuario.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa y luego aplica el subset soportado: **negrita**, "- " viñetas y saltos de línea. */
export function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "&bull; $1")
    .replace(/\n/g, "<br/>")
    .replace(/•/g, "&bull;");
}
