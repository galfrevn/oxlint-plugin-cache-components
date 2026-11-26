import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin, Rule } from "@oxlint/plugins";

import packageJson from "../package.json" with { type: "json" };
import { PLUGIN_NAME, presetRules, RULES } from "./rules/index.ts";
import type { PresetName, RuleSetting } from "./rules/index.ts";

export interface FlatConfig {
  name: string;
  plugins: Record<string, object>;
  rules: Record<string, RuleSetting>;
}

export interface CacheComponentsPlugin extends Plugin {
  meta: { name: string; version: string };
  configs: Record<`flat/${PresetName}`, FlatConfig>;
}

const plugin = eslintCompatPlugin({
  meta: { name: PLUGIN_NAME },
  rules: Object.fromEntries(
    Object.entries(RULES).map(([name, entry]): [string, Rule] => [name, entry.rule]),
  ),
});

function createFlatConfig(preset: PresetName): FlatConfig {
  return {
    name: `${PLUGIN_NAME}/${preset}`,
    plugins: { [PLUGIN_NAME]: plugin },
    rules: presetRules(preset),
  };
}

const cacheComponents: CacheComponentsPlugin = Object.assign(plugin, {
  meta: { name: PLUGIN_NAME, version: packageJson.version },
  configs: {
    "flat/recommended": createFlatConfig("recommended"),
    "flat/strict": createFlatConfig("strict"),
    "flat/migration": createFlatConfig("migration"),
    "flat/all": createFlatConfig("all"),
  },
});

export default cacheComponents;
