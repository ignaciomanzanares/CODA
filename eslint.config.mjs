// ESLint 9 flat config — monorepo CODA.
// Filosofía: gate REAL en CI desde el día uno → empezamos con recommended
// calibrado para el código existente (cero errores) y se endurece con el
// tiempo. Lo estilístico lo maneja Prettier (eslint-config-prettier apaga
// cualquier regla que choque).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/dev-dist/**",
      "apps/web/public/**",
      "apps/api/src/ml/artifacts/**",
      "apps/api/src/ml/out/**",
      "apps/api/src/ml/.venv/**",
      "apps/api/ml/**",
      "drizzle/**",
      "**/*.min.js",
      // output viejo de tsc botado en src/ (untracked); el source es .ts
      "packages/**/*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Calibración para el codebase existente. Endurecer gradualmente.
    plugins: { "unused-imports": unusedImports },
    rules: {
      // Imports sin uso: autofixable (eslint --fix los elimina).
      "unused-imports/no-unused-imports": "error",
      // Patrón shadcn: `interface XProps extends Primitive.Props {}`.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
      // El schema dual-dialecto y Empresas usan `any` por diseño (ver schema.ts).
      "@typescript-eslint/no-explicit-any": "off",
      // Variables locales sin uso: WARN mientras existan los ~53 casos legacy
      // (muchos en componentes muertos — ver auditoría §9). Subir a "error"
      // tras la limpieza de código muerto. Los IMPORTS sin uso ya son error
      // (regla de arriba, autofixable).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      // Patrón frecuente y legítimo acá: `catch {}` con fallback silencioso documentado.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Frontend: React + hooks. jsx-runtime (sin `import React`).
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      // shadcn/Radix usan patrones que gatillan estos sin ser bugs:
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Backend, packages y scripts: entorno Node.
    files: [
      "apps/api/**/*.{ts,mts,js,mjs}",
      "packages/**/*.ts",
      "scripts/**/*.mjs",
      "docker/**/*.mjs",
      "*.config.{ts,mjs,js}",
      "apps/*/*.config.{ts,mjs,js}",
      "apps/web/scripts/**/*.mjs",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  // SIEMPRE al final: desactiva reglas que chocan con Prettier.
  prettier,
);
