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

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HelmetProvider>
);

reportWebVitals();
