/**
 * Referral system utilities.
 *
 * Generates a short, deterministic referral code from the user ID,
 * builds share URLs, and creates WhatsApp deep links.
 */

const REFERRAL_PARAM = "ref";
const REFERRAL_STORAGE_KEY = "coda-referral-code";

/** Generate a short referral code from a user ID (deterministic). */
export function generateReferralCode(userId: string): string {
  // Take last 6 chars of userId hex, uppercase
  const clean = userId.replace(/[^a-zA-Z0-9]/g, "");
  const suffix = clean.slice(-6).toUpperCase();
  return `CODA${suffix}`;
}

/** Build the full referral URL for sharing. */
export function getReferralUrl(code: string): string {
  const base =
    typeof window !== "undefined" ? window.location.origin : "https://www.codafinance.cl";
  return `${base}/registro?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}

/** Build a WhatsApp share link with a pre-written message. */
export function getWhatsAppShareUrl(code: string, userName?: string): string {
  const url = getReferralUrl(code);
  const name = userName?.split(" ")[0] || "Tu amigo";
  const message =
    `${name} te invita a CODA — tu diagnóstico financiero gratis.\n\n` +
    `Conoce tu score crediticio y encuentra los mejores productos financieros para ti. ` +
    `100% gratis, sin tarjeta de crédito.\n\n` +
    `${url}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Read the referral code from the current URL (if present). */
export function getRefFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(REFERRAL_PARAM);
}

/** Persist the referral code so it survives page navigation to /registro. */
export function storeReferralCode(code: string): void {
  try {
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch {
    /* storage full / unavailable */
  }
}

/** Retrieve the stored referral code (used during signup). */
export function getStoredReferralCode(): string | null {
  try {
    return sessionStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Clear the stored referral after signup completes. */
export function clearStoredReferralCode(): void {
  try {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
