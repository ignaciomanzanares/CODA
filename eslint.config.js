import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

export default [
  // Ignore patterns (must come first)
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "server/ml/.venv/**",
      "**/.venv/**",
      "coverage/**",
      "*.config.js",
      "**/*.tsbuildinfo",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    rules: {
      // Modern React doesn't need React import for JSX
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      
      // React hooks best practices
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // Allow empty interfaces (common pattern with TypeScript)
      "@typescript-eslint/no-empty-object-type": "off",
      
      // Less strict on unused vars (allow underscore prefix)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      
      // Allow any type in certain cases
      "@typescript-eslint/no-explicit-any": "warn",
      
      // Disable prop-types since we're using TypeScript
      "react/prop-types": "off",
    },
  },
];
