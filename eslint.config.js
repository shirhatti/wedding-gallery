// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";

import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: [".wrangler/tmp/**", "storybook-static/**"] },
  {
    files: ["workers/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd()
      },
      globals: {
        console: "readonly",
        URL: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      semi: "error",
      quotes: ["error", "double"],
      "@typescript-eslint/no-unused-vars": "warn"
    }
  },
  {
    files: ["pages/*/src/**/*.{ts,tsx}", "pages/*/.storybook/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      semi: "error",
      quotes: ["error", "double"],
      "@typescript-eslint/no-unused-vars": "warn"
    }
  },
  ...storybook.configs["flat/recommended"]
];
