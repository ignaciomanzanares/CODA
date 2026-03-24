import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

/** Particionado de vendor para mejor caché y paralelismo (Lighthouse / FCP). */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return;
  if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
    return "vendor-react";
  }
  if (id.includes("node_modules/wouter")) return "vendor-router";
  if (id.includes("node_modules/@tanstack/react-query")) return "vendor-query";
  /* recharts depende de react: no separar en chunk propio (evita ciclo vendor-react ↔ vendor-charts) */
  if (id.includes("node_modules/lucide-react")) return "vendor-ui";
  if (
    id.includes("node_modules/react-hook-form") ||
    id.includes("node_modules/@hookform/resolvers")
  ) {
    return "vendor-forms";
  }
}

// `public/` se copia tal cual a la raíz de `dist/` (robots.txt, sitemap.xml, manifest.json, favicon, etc.).
// Vite no aplica fallback SPA a esos archivos: se sirven como estáticos. El fallback agresivo suele estar
// en el hosting (p. ej. vercel.json); ahí excluir rutas estáticas para no devolver index.html.
export default defineConfig({
  publicDir: "public",
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.ANALYZE === "true"
      ? [
          visualizer({
            filename: "dist/stats.html",
            gzipSize: true,
            brotliSize: true,
            open: false,
            template: "treemap",
          }),
        ]
      : []),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: false,
      includeAssets: ["favicon.svg", "icons/*.png", "og-image.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.+\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 86400,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts-cache",
              expiration: {
                maxAgeSeconds: 31536000,
              },
            },
          },
        ],
      },
    }),
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
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
