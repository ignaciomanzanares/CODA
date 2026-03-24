import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Banner inferior cuando hay nueva versión del SW (vite-plugin-pwa, registerType: prompt).
 */
export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      /* opcional: métricas */
    },
    onRegisterError(err) {
      console.warn("[PWA] SW registration error", err);
    },
  });

  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 px-4 py-3 shadow-lg animate-pwa-slide-up"
      style={{
        backgroundColor: "#1e293b",
        color: "#fff",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
      }}
      role="status"
      aria-live="polite"
    >
      <span className="text-sm font-medium">Nueva versión disponible</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "#3b82f6", minHeight: "44px" }}
          onClick={() => {
            void updateServiceWorker(true);
          }}
        >
          Actualizar
        </button>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md text-xl leading-none text-white/90 hover:bg-white/10"
          aria-label="Cerrar"
          onClick={() => {
            setDismissed(true);
            setNeedRefresh(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
