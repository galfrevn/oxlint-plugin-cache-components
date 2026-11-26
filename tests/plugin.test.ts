import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import configs, { all, migration, recommended, strict } from "../src/configs.ts";
import plugin from "../src/index.ts";
import { RULES } from "../src/rules/index.ts";
import { ruleDocsUrl } from "../src/utils/messages.ts";

const RULE_NAMES = Object.keys(RULES);

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("plugin", () => {
  it("is named cache-components and exposes every rule", () => {
    expect(plugin.meta).toEqual({ name: "cache-components", version: expect.any(String) });
    expect(Object.keys(plugin.rules).toSorted()).toEqual(RULE_NAMES.toSorted());
    expect(RULE_NAMES).toHaveLength(13);
  });

  it("adds an ESLint create function to every rule", () => {
    for (const rule of Object.values(plugin.rules)) {
      expect(typeof rule.create).toBe("function");
    }
  });

  it.each(RULE_NAMES)("documents %s", (name) => {
    const meta = RULES[name]?.rule.meta;
    expect(meta?.docs?.url).toBe(ruleDocsUrl(name));
    expect(meta?.docs?.description).toMatch(/^[A-Z].*\.$/);
    expect(existsSync(new URL(`../docs/rules/${name}.md`, import.meta.url))).toBe(true);
    expect(readProjectFile(`docs/rules/${name}.md`)).toContain(`# \`cache-components/${name}\``);
  });

  it.each(RULE_NAMES)("tests every message of %s", (name) => {
    const tests = readProjectFile(`tests/rules/${name}.test.ts`);
    const messages = RULES[name]?.rule.meta?.messages ?? {};
    for (const messageId of Object.keys(messages)) {
      expect(tests, `${name}: ${messageId}`).toContain(`messageId: "${messageId}"`);
    }
  });

  it.each(RULE_NAMES)("links every message of %s to the docs", (name) => {
    const messages = RULES[name]?.rule.meta?.messages ?? {};
    const reports = Object.entries(messages).filter(
      ([id]) => !/^(add|use|keep|remove)[A-Z]/.test(id),
    );
    for (const [id, text] of reports) {
      expect(text, `${name}: ${id}`).toMatch(/See (https:\/\/nextjs\.org\/docs\/\S+|\{\{url\}\})$/);
    }
  });
});

describe("presets", () => {
  it("reports Next.js errors as errors and the rest as warnings in recommended", () => {
    expect(recommended.rules).toEqual({
      "cache-components/no-request-api-in-cache": "error",
      "cache-components/no-cache-api-outside-cache": "error",
      "cache-components/require-cachelife-when-nested": "error",
      "cache-components/no-invalid-cache-nesting": "error",
      "cache-components/valid-invalidation-context": "error",
      "cache-components/no-promise-args-to-cache": "error",
      "cache-components/require-revalidate-tag-profile": "warn",
      "cache-components/require-revalidate-path-type": "warn",
      "cache-components/require-auth-before-revalidate": "warn",
    });
  });

  it("raises the core rules to error and adds the heuristic rules as warnings in strict", () => {
    expect(strict.rules).toEqual({
      "cache-components/no-request-api-in-cache": "error",
      "cache-components/no-cache-api-outside-cache": "error",
      "cache-components/require-cachelife-when-nested": "error",
      "cache-components/no-invalid-cache-nesting": "error",
      "cache-components/valid-invalidation-context": "error",
      "cache-components/no-promise-args-to-cache": "error",
      "cache-components/require-revalidate-tag-profile": "error",
      "cache-components/require-revalidate-path-type": "error",
      "cache-components/require-auth-before-revalidate": "error",
      "cache-components/no-introspect-passthrough": "warn",
      "cache-components/serializable-cache-args": "warn",
      "cache-components/no-react-cache-across-boundary": "warn",
    });
  });

  it("enables only the segment config rule in migration", () => {
    expect(migration.rules).toEqual({
      "cache-components/no-legacy-segment-config": ["error", { cacheComponents: true }],
    });
  });

  it("enables every rule as an error in all", () => {
    expect(Object.keys(all.rules)).toEqual(RULE_NAMES.map((name) => `cache-components/${name}`));
    for (const setting of Object.values(all.rules)) {
      expect(Array.isArray(setting) ? setting[0] : setting).toBe("error");
    }
  });

  it("registers the plugin by its package name", () => {
    for (const preset of Object.values(configs)) {
      expect(preset.jsPlugins).toEqual([
        { name: "cache-components", specifier: expect.stringMatching(/\/dist\/index\.js$/) },
      ]);
    }
  });

  it("ships matching ESLint flat configs", () => {
    expect(plugin.configs["flat/recommended"]).toEqual({
      name: "cache-components/recommended",
      plugins: { "cache-components": plugin },
      rules: recommended.rules,
    });
    expect(plugin.configs["flat/strict"].rules).toEqual(strict.rules);
    expect(plugin.configs["flat/migration"].rules).toEqual(migration.rules);
    expect(plugin.configs["flat/all"].rules).toEqual(all.rules);
  });
});
