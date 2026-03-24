import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// `public/` se copia tal cual a la raíz de `dist/` (robots.txt, sitemap.xml, manifest.json, favicon, etc.).
// Vite no aplica fallback SPA a esos archivos: se sirven como estáticos. El fallback agresivo suele estar
// en el hosting (p. ej. vercel.json); ahí excluir rutas estáticas para no devolver index.html.
export default defineConfig({
  publicDir: "public",
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "../../packages/src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
