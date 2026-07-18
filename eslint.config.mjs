// @ts-check
// Flat ESLint config for OpenWork Plus.
//
// Scope: limited to catching *silent renderer regressions* — primarily
// unresolvable imports (the "Failed to resolve import '...bundles-view.tsx'"
// class of bug that Vite dev server hides on-demand). This is intentionally
// NOT a comprehensive lint setup; the project's primary quality gates
// remain `tsc --noEmit` and `vite build`.
//
// Why flat config: ESLint 9.x dropped legacy .eslintrc. We use the smallest
// viable plugin set: typescript-eslint (parser + recommended rules disabled
// to avoid noise) + eslint-plugin-import (the actual goal: import/no-unresolved).
//
// Run: pnpm lint
// Run: pnpm lint:fix

import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Stub plugin that declares upstream-referenced rule names so existing
// `// eslint-disable-next-line <rule>` comments in the codebase don't fail
// with "Definition for rule X was not found". The rules themselves are
// no-ops — they report nothing. We deliberately do NOT install the real
// plugins (eslint-plugin-react-hooks etc.) to keep the toolchain minimal;
// the inline disables exist because those rules were once enforced under
// a different config and the code was already audited at that time.
const stubPlugin = {
  rules: {
    "exhaustive-deps": { meta: { type: "suggestion" }, create() { return {}; } },
    "rules-of-hooks": { meta: { type: "problem" }, create() { return {}; } },
  },
};

export default tseslint.config(
  // Ignore build artifacts and vendored code. Mirrors .gitignore for paths
  // that would otherwise explode the linter.
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.openwork/**",
      "**/vendor/**",
      "**/*.config.*",
      "apps/app/dist/**",
      "apps/server/dist/**",
      "apps/desktop/resources/**",
      "patches/**",
      "scripts/**",
    ],
  },

  // TypeScript files: enable the import resolver + the rule we actually care about.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [
      // We deliberately do NOT enable typescript-eslint's recommended rule
      // sets — they would generate hundreds of warnings on a codebase that
      // was not authored under ESLint. We only use the parser so that
      // eslint-plugin-import can walk TS syntax.
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
      "react-hooks": stubPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          // Multiple projects: app, server, types. Each has its own path
          // aliases. Listing them here lets the resolver follow cross-package
          // imports like @openwork/types/* and @/*.
          project: [
            "apps/app/tsconfig.json",
            "apps/server/tsconfig.json",
            "packages/types/tsconfig.json",
          ],
          alwaysTryTypes: true,
        },
        node: {
          // Allow .mjs/.cjs resolution (Electron main-process files).
          extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"],
        },
      },
    },
    rules: {
      // The primary rule: every import (relative or aliased) MUST resolve to
      // a real file. The bundles-view.tsx bug would have been caught here.
      "import/no-unresolved": "error",
      // Catch duplicate / mis-ordered imports early — cheap to satisfy.
      "import/no-duplicates": "warn",
      // Disallow import of things not in module exports (named imports).
      "import/named": "warn",
      // Warn on cycles — they were a real problem in the SolidJS shell.
      "import/no-cycle": "off", // too noisy for now; enable later if needed
      // Don't enforce a specific export style; this codebase mixes.
      "import/exports-last": "off",
      "import/first": "off",
      "import/extend": "off",
      // Declare (but do not enforce) common TS/React rules so that the
      // upstream eslint-disable comments don't fail with "rule not found".
      // We're NOT running these rules — we just need them to be defined so
      // the inline disable directives are valid.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      "no-console": "off",
      "no-unused-vars": "off",
    },
  },

  // JS/MJS files (Electron main, scripts). Lighter touch.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".mjs", ".cjs", ".json"],
        },
      },
    },
    rules: {
      "import/no-unresolved": "error",
      "import/no-duplicates": "warn",
    },
  },
);
