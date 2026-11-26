import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import type { CacheComponentsPlugin } from "../../src/index.ts";
import { FIXTURES } from "./helpers.ts";

async function loadBuiltPlugin(): Promise<CacheComponentsPlugin> {
  const entry = new URL("../../dist/index.js", import.meta.url).href;
  const module = (await import(entry)) as { default: CacheComponentsPlugin };
  return module.default;
}

describe("ESLint compatibility", () => {
  it("runs the flat/recommended config", async () => {
    const plugin = await loadBuiltPlugin();
    const eslint = new ESLint({
      cwd: join(FIXTURES, "eslint"),
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.{js,jsx}"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        },
        plugin.configs["flat/recommended"],
      ],
    });
    const results = await eslint.lintFiles(["app"]);
    const findings = results
      .flatMap((result) =>
        result.messages.map(
          (message) =>
            `${result.filePath.slice(result.filePath.indexOf("app"))}:${message.line} ${message.ruleId}`,
        ),
      )
      .toSorted();

    expect(findings).toEqual([
      "app/actions.js:6 cache-components/no-cache-api-outside-cache",
      "app/api/revalidate/route.js:7 cache-components/require-revalidate-tag-profile",
      "app/api/revalidate/route.js:8 cache-components/require-revalidate-path-type",
      "app/page.jsx:5 cache-components/no-request-api-in-cache",
    ]);
  });

  it("exposes plugin metadata", async () => {
    const plugin = await loadBuiltPlugin();
    expect(plugin.meta).toEqual({ name: "cache-components", version: expect.any(String) });
    expect(Object.keys(plugin.configs)).toEqual(["flat/recommended", "flat/strict", "flat/all"]);
  });
});
