import { defineConfig as defineEslintConfig } from "eslint/config";
import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

import cacheComponents, { recommended, strict } from "../../src/configs.ts";
import type { OxlintPresets } from "../../src/configs.ts";
import plugin from "../../src/index.ts";

export const presets: Readonly<Record<keyof OxlintPresets, OxlintConfig>> = cacheComponents;

export const oxlintConfig: object = defineConfig({
  extends: [recommended, strict],
  settings: { "cache-components": { requestApis: ["next-auth:auth"] } },
});

export const eslintConfig: object = defineEslintConfig([plugin.configs["flat/recommended"]]);
