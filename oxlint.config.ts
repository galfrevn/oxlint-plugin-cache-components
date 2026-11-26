import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import", "node", "promise", "vitest"],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  env: {
    node: true,
    es2024: true,
  },
  ignorePatterns: [
    "dist/**",
    "coverage/**",
    ".corpus/**",
    "tests/fixtures/**",
    "conformance/next-app/**",
  ],
  rules: {
    "eslint/no-console": "error",
    "eslint/no-warning-comments": "error",
    "eslint/prefer-const": "error",
    "eslint/eqeqeq": "error",
    "typescript/consistent-type-imports": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "import/no-cycle": "error",
    "import/no-default-export": "off",
    "unicorn/prefer-node-protocol": "error",
  },
  overrides: [
    {
      files: ["scripts/**", "conformance/cases/**"],
      rules: {
        "eslint/no-console": "off",
      },
    },
  ],
});
