import { defineConfig } from "oxlint";
import cacheComponents from "oxlint-plugin-cache-components/configs";

export default defineConfig({
  extends: [cacheComponents.all, cacheComponents.migration],
});
