import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Varios tests parsean PDFs reales (pdfjs, OCR fallback) y persisten en SQLite: ~2–3 s en
    // frío, pero >5 s (el default) con la máquina cargada — p. ej. dos sesiones corriendo la
    // batería a la vez (carga ~11). Fallaban por timeout, no por lógica, y dejaban
    // `npm run ci:verify` rojo sin motivo (uploadPartialFailed, uploadScoreBestEffort,
    // genericParser). Un test que de verdad se cuelga igual falla, a los 20 s.
    testTimeout: 20_000,
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/types/**",
        "client/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
