import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "coda-pwa-install-dismissed";

/** Tracks the `beforeinstallprompt` event for showing an in-app install banner. */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    const ts = localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    // Re-show after 7 days
    return Date.now() - Number(ts) < 7 * 24 * 60 * 60 * 1000;
  });

  useEffect(() => {
    // Already installed as standalone PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detect install after prompt
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      setIsInstalled(true);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  }, []);

  return {
    canInstall: !!deferredPrompt && !isInstalled && !dismissed,
    isInstalled,
    install,
    dismiss,
  };
}
