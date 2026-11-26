import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin, Rule } from "@oxlint/plugins";

import { RULES } from "./rules/index.ts";

const plugin: Plugin = eslintCompatPlugin({
  meta: { name: "cache-components" },
  rules: Object.fromEntries(
    Object.entries(RULES).map(([name, entry]): [string, Rule] => [name, entry.rule]),
  ),
});

export default plugin;
