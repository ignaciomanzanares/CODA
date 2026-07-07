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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HelmetProvider>
);

reportWebVitals();
