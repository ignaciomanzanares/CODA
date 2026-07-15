import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

/** Particionado de vendor para mejor caché y paralelismo (Lighthouse / FCP). */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return;
  // `clsx` is used by the app shell via cn(). Recharts also depends on it; without
  // this pin Rollup can place clsx inside vendor-charts, forcing charts into the
  // initial shell and PWA precache.
  if (id.includes("node_modules/clsx")) return "vendor-ui";
  if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
    return "vendor-react";
  }
  if (id.includes("node_modules/wouter")) return "vendor-router";
  if (id.includes("node_modules/@tanstack/react-query")) return "vendor-query";
  if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
    return "vendor-charts";
  }
  if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
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
    // PWA (PWA-1): manifest en public/manifest.json (display: standalone). SW propio en
    // src/sw.ts (injectManifest): precache Workbox + handlers de Web Push en un solo SW.
    // Las estrategias de runtime cache viven en src/sw.ts — /api/ NO se cachea (datos
    // personales fuera de CacheStorage).
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: false,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // PWA-3: precache diet. Keep only the offline app shell and install assets.
        // Lazy route chunks, screenshots and iOS splash images stay network/runtime-cached.
        globPatterns: [
          "index.html",
          "favicon.svg",
          "manifest.json",
          "icons/*.png",
          "assets/index-*.js",
          "assets/index-*.css",
          "assets/vendor-react-*.js",
          "assets/vendor-router-*.js",
          "assets/vendor-query-*.js",
          "assets/vendor-radix-*.js",
          "assets/vendor-ui-*.js",
          "assets/workbox-window*.js",
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer())]
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
