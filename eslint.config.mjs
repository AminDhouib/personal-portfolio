import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import oxlint from "eslint-plugin-oxlint";
import local from "./eslint-rules/index.mjs";

// no-restricted-syntax selectors: the escape hatches oxlint's category set does
// not cover. Each maps to an audit finding class.
const RESTRICTED_SYNTAX = [
  {
    selector: "TSAsExpression > TSAnyKeyword",
    message: "`as any` defeats the type system. Give it a real type or zod-validate it.",
  },
  {
    selector: "TSAsExpression > TSUnknownKeyword",
    message:
      "`as unknown` is the double-cast escape hatch (`x as unknown as Y`). Give it a real type or zod-validate it.",
  },
  {
    selector:
      "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
    message: "Empty `.catch(() => {})` swallows the rejection. Report it or handle it explicitly.",
  },
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
    message: "Route JSON.parse through `src/lib/safe-json.ts` so parse failures are reported.",
  },
];

// fs is the persistence boundary (RC-2). Only these inventoried files may touch
// it directly; every other component/route/game must go through a store module.
const FS_ALLOWLIST = [
  "src/lib/blog.ts",
  "src/lib/leaderboard-store.ts",
  "src/app/apple-icon.tsx",
  "src/app/icon.tsx",
  "src/app/api/leads/route.ts",
  // Non-mutating W_OK probe on the persistence-adjacent .data directory for the
  // liveness/readiness check (P4) -- reads no application data, writes nothing.
  "src/app/api/health/route.ts",
];

const TEST_AND_SCRIPT_GLOBS = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "scripts/**"];

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // ---- Type-aware + custom-rule layer (TS/TSX only; needs the project service) ----
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, local },
    rules: {
      // Tier 3 — type-aware (the high-signal async + error-shape set)
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/only-throw-error": "error",

      // Tier 1 — local custom rules (require-schema-parse is scoped to routes below)
      "local/no-silent-catch": "error",
      "local/fetch-requires-signal": "error",
      "local/no-unknown-in-public-api": "error",

      // Tier 2 — option-heavy restrict rules (guaranteed-compatible in eslint)
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Import `env` from `@/env` instead of reading process.env directly.",
        },
      ],
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "fs", message: "Use a store module; fs is the persistence boundary (RC-2)." },
            {
              name: "node:fs",
              message: "Use a store module; fs is the persistence boundary (RC-2).",
            },
            {
              name: "fs/promises",
              message: "Use a store module; fs is the persistence boundary (RC-2).",
            },
            {
              name: "node:fs/promises",
              message: "Use a store module; fs is the persistence boundary (RC-2).",
            },
          ],
        },
      ],
    },
  },

  // ---- require-schema-parse: API route handlers only ----
  {
    files: ["src/app/api/**/route.ts"],
    plugins: { local },
    rules: { "local/require-schema-parse-in-routes": "error" },
  },

  // ---- fs boundary allowlist (inventoried direct-fs users) ----
  {
    files: FS_ALLOWLIST,
    rules: { "no-restricted-imports": "off" },
  },

  // ---- env gateway + framework config: allowed to read process.env directly ----
  {
    files: [
      "src/env.ts",
      "next.config.ts",
      "src/instrumentation.ts",
      "src/instrumentation-client.ts",
      "src/components/game/space-shooter.tsx",
    ],
    rules: { "no-restricted-properties": "off" },
  },

  // ---- tests + scripts: different trust level ----
  {
    files: TEST_AND_SCRIPT_GLOBS,
    rules: {
      "local/no-silent-catch": "off",
      "local/no-unknown-in-public-api": "off",
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
      "no-restricted-properties": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },

  // ---- eslint-plugin-oxlint LAST: turn off eslint rules oxlint already runs ----
  ...oxlint.buildFromOxlintConfigFile("./.oxlintrc.json"),

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "**/graphify-out/**",
    "_to-remove-voltorb/**",
    "public/tower_stacker/**",
    "audit/**",
  ]),
]);
