import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// `public/` se copia tal cual a la raíz de `dist/` (robots.txt, sitemap.xml, manifest.json, favicon, etc.).
// Vite no aplica fallback SPA a esos archivos: se sirven como estáticos. El fallback agresivo suele estar
// en el hosting (p. ej. vercel.json); ahí excluir rutas estáticas para no devolver index.html.
export default defineConfig({
  publicDir: "public",
  plugins: [
    react(),
    runtimeErrorOverlay(),
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
  },
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
