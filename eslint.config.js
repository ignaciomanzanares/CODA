import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

export default [
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
    rules: {
      // Modern React doesn't need React import for JSX
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      
      // Allow empty interfaces (common pattern with TypeScript)
      "@typescript-eslint/no-empty-object-type": "off",
      
      // Less strict on unused vars (allow underscore prefix)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      
      // Allow any type in certain cases
      "@typescript-eslint/no-explicit-any": "warn",
      
      // Disable prop-types since we're using TypeScript
      "react/prop-types": "off",
    },
  },
];
