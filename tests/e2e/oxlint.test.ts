import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FIXTURES, parseFindings, runOxlint } from "./helpers.ts";

const APP = join(FIXTURES, "app");
const CONFIGS = join(FIXTURES, "configs");

const EXPECTED = [
  { severity: "error", location: "app/account/page.tsx:11", rule: "no-invalid-cache-nesting" },
  { severity: "error", location: "app/actions.ts:6", rule: "no-cache-api-outside-cache" },
  { severity: "warning", location: "app/actions.ts:7", rule: "require-auth-before-revalidate" },
  { severity: "warning", location: "app/actions.ts:7", rule: "require-revalidate-tag-profile" },
  {
    severity: "warning",
    location: "app/api/revalidate/route.ts:4",
    rule: "require-auth-before-revalidate",
  },
  {
    severity: "error",
    location: "app/api/revalidate/route.ts:4",
    rule: "valid-invalidation-context",
  },
  {
    severity: "warning",
    location: "app/api/revalidate/route.ts:5",
    rule: "require-revalidate-path-type",
  },
  { severity: "error", location: "app/page.tsx:11", rule: "require-cachelife-when-nested" },
  { severity: "error", location: "app/page.tsx:12", rule: "no-request-api-in-cache" },
  { severity: "error", location: "app/prefs/page.tsx:4", rule: "no-promise-args-to-cache" },
];

describe("oxlint CLI", () => {
  it.each(["preset.config.ts", "manual.json"])(
    "reports every rule with the %s configuration from the docs",
    async (config) => {
      const output = await runOxlint(APP, ["-c", join(CONFIGS, config), "--format", "json", "."]);
      expect(parseFindings(output)).toEqual(EXPECTED);
    },
  );

  it("prints self-contained messages in the agent format", async () => {
    const output = await runOxlint(APP, [
      "-c",
      join(CONFIGS, "preset.config.ts"),
      "--format",
      "agent",
      "app/api/revalidate/route.ts",
    ]);
    expect(output).toContain(
      "app/api/revalidate/route.ts:4:3: error cache-components(valid-invalidation-context): `updateTag()` can only be called from within a Server Action.",
    );
    expect(output).toContain("See https://nextjs.org/docs/app/api-reference/functions/updateTag");
  });
});
