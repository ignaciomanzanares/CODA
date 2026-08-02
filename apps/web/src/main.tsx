import "./i18n";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import { reportWebVitals } from "./lib/webVitals";
import { initWebObservability } from "./lib/observability";

// #27: Sentry frontend (no-op si VITE_SENTRY_DSN no está configurado).
void initWebObservability();

// PWA-1: el SW se registra vía useRegisterSW (PWAUpdatePrompt / virtual:pwa-register),
// que además maneja el flujo de actualización con prompt. Sin register manual duplicado.

// Auto-recuperación ante chunk lazy caído: si un import dinámico falla al cargar su
// módulo (típicamente un index viejo cacheado tras un deploy → hash 404), recargamos
// UNA vez para traer el index fresco. El flag por-sesión evita loops si el fallo
// persiste (server realmente caído → cae al ErrorBoundary, sin recargar en bucle).
window.addEventListener("vite:preloadError", (event) => {
  if (sessionStorage.getItem("coda:chunkReloaded")) return;
  sessionStorage.setItem("coda:chunkReloaded", "1");
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HelmetProvider>,
);

reportWebVitals();
