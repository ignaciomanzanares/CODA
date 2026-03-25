/** Vibración corta en móviles que soportan la Vibration API (PWA). */
export function hapticLight(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(10);
    } catch {
      /* noop */
    }
  }
}
