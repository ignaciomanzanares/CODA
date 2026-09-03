import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PWAInstallMode = "native" | "ios-manual" | null;

const DISMISSED_KEY = "coda-pwa-install-dismissed";
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type NavigatorLike = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
  standalone?: boolean;
};

type WindowLike = Pick<Window, "matchMedia"> & {
  navigator: NavigatorLike;
};

export function isAppleMobilePlatform(nav: NavigatorLike) {
  const ua = nav.userAgent || "";
  const platform = nav.platform || "";
  return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1);
}

export function isStandalonePWA(win: WindowLike) {
  return Boolean(win.navigator.standalone || win.matchMedia("(display-mode: standalone)").matches);
}

/**
 * ¿El dispositivo es "de tipo móvil" (teléfono/tablet)? Instalar una PWA en un laptop/PC es válido
 * técnicamente, pero el banner de instalación no aporta ahí y molesta: Chromium (Brave incl.)
 * dispara `beforeinstallprompt` también en desktop. Gateamos el banner a móvil por UA o por
 * puntero grueso (touch primario). En desktop la instalación sigue disponible por el ícono del
 * navegador; solo ocultamos NUESTRO banner.
 */
export function isMobileLikeDevice(win: WindowLike) {
  const ua = win.navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  if (isAppleMobilePlatform(win.navigator)) return true; // iPadOS moderno (MacIntel + touch)
  try {
    return win.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function readInstallDismissed() {
  if (typeof window === "undefined") return false;

  try {
    const ts = window.localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

function writeInstallDismissed() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Some browsers disable storage in restrictive modes; dismissal can remain session-only.
  }
}

/** Tracks the `beforeinstallprompt` event for showing an in-app install banner. */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [manualInstallAvailable, setManualInstallAvailable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(readInstallDismissed);

  useEffect(() => {
    if (isStandalonePWA(window)) {
      setIsInstalled(true);
      return;
    }

    // Solo ofrecemos instalar en dispositivos de tipo móvil; en desktop el banner no se muestra.
    const mobile = isMobileLikeDevice(window);
    setManualInstallAvailable(mobile && isAppleMobilePlatform(window.navigator));

    const handler = (e: Event) => {
      // preventDefault siempre (suprime el mini-infobar de Chrome); guardamos el prompt solo en móvil.
      e.preventDefault();
      if (!mobile) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setManualInstallAvailable(false);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setManualInstallAvailable(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", handleInstalled);
    };
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
    writeInstallDismissed();
  }, []);

  const installMode: PWAInstallMode = deferredPrompt
    ? "native"
    : manualInstallAvailable
      ? "ios-manual"
      : null;

  return {
    canInstall: Boolean(installMode) && !isInstalled && !dismissed,
    installMode,
    isInstalled,
    install,
    dismiss,
  };
}
