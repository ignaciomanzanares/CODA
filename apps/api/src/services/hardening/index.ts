/**
 * D8 — Primitivas de hardening reutilizables por los conectores de fuentes (CMF/SII/AFC/scraper):
 * retry con backoff y redacción de PII para logs.
 */
export { retryWithBackoff, backoffDelay, type RetryOptions } from "./retry.js";
export { redactPii, redactRut, redactEmail, isPiiKey } from "./piiSafe.js";
