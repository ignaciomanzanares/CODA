import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * #16: harness de tests del frontend. Hoy con `environment: 'node'` para tests de lógica pura
 * (utils). Para tests de componentes (login/onboarding con React Testing Library), instalar
 * `@testing-library/react` + `jsdom`, cambiar a `environment: 'jsdom'` y agregar un setup con
 * `@testing-library/jest-dom` — ver README. La config vive separada de vite.config.ts para no
 * arrastrar plugins de build (PWA, prerender) a los tests.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
