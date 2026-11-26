import { PLUGIN_NAME, presetRules } from "./rules/index.ts";
import type { PresetName, RuleSetting } from "./rules/index.ts";

export interface OxlintPreset {
  jsPlugins: { name: string; specifier: string }[];
  rules: Record<string, RuleSetting>;
}

export interface OxlintPresets {
  readonly recommended: OxlintPreset;
  readonly strict: OxlintPreset;
  readonly migration: OxlintPreset;
  readonly all: OxlintPreset;
}

const specifier = import.meta.resolve("oxlint-plugin-cache-components");

function createPreset(preset: PresetName): OxlintPreset {
  return {
    jsPlugins: [{ name: PLUGIN_NAME, specifier }],
    rules: presetRules(preset),
  };
}

export const recommended: OxlintPreset = createPreset("recommended");
export const strict: OxlintPreset = createPreset("strict");
export const migration: OxlintPreset = createPreset("migration");
export const all: OxlintPreset = createPreset("all");

const configs: OxlintPresets = { recommended, strict, migration, all };

export default configs;
