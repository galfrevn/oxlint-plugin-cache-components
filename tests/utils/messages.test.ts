import { describe, expect, it } from "vitest";

import {
  NEXT_REQUEST_IN_USE_CACHE_URL,
  requestApiUrl,
  ruleDocsUrl,
  scopeLabel,
  UNSTABLE_CACHE_URL,
} from "../../src/utils/messages.ts";
import * as messages from "../../src/utils/messages.ts";

describe("scopeLabel", () => {
  it("matches the scope names Next.js uses in its errors", () => {
    expect(scopeLabel({ type: "public" })).toBe('"use cache"');
    expect(scopeLabel({ type: "remote" })).toBe('"use cache: remote"');
    expect(scopeLabel({ type: "private" })).toBe('"use cache: private"');
    expect(scopeLabel({ type: "custom", name: "kv" })).toBe('"use cache: kv"');
    expect(scopeLabel({ type: "unstable" })).toBe("`unstable_cache()`");
  });
});

describe("URLs", () => {
  it("links request APIs to the page Next.js links for each scope", () => {
    expect(requestApiUrl({ type: "public" })).toBe(NEXT_REQUEST_IN_USE_CACHE_URL);
    expect(requestApiUrl({ type: "unstable" })).toBe(UNSTABLE_CACHE_URL);
  });

  it("uses https URLs on nextjs.org", () => {
    const urls = Object.entries(messages)
      .filter(([name]) => name.endsWith("_URL"))
      .map(([, value]) => value);
    expect(urls.length).toBeGreaterThan(10);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/nextjs\.org\/docs\/(messages|app)\/[\w/-]+$/);
    }
  });

  it("links rule docs to the repository", () => {
    expect(ruleDocsUrl("no-request-api-in-cache")).toBe(
      "https://github.com/galfrevn/oxlint-plugin-cache-components/blob/main/docs/rules/no-request-api-in-cache.md",
    );
  });
});
