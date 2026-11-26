import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/configs.ts"],
  tsconfig: "tsconfig.build.json",
  format: "esm",
  platform: "node",
  target: "node20.19",
  fixedExtension: false,
  dts: true,
  clean: true,
  publint: { level: "error" },
  attw: { profile: "esm-only", level: "error" },
});
