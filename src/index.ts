import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin } from "@oxlint/plugins";

const plugin: Plugin = eslintCompatPlugin({
  meta: { name: "cache-components" },
  rules: {},
});

export default plugin;
