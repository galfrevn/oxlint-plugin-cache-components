import type { Context } from "@oxlint/plugins";
import { describe, expect, it } from "vitest";

import {
  getBoolean,
  getRuleOptions,
  getStringList,
  textMentions,
} from "../../src/utils/options.ts";

function fakeContext(options: unknown[], settings: Record<string, unknown> = {}): Context {
  return { options, settings } as unknown as Context;
}

describe("getRuleOptions", () => {
  it("returns the first option object or an empty object", () => {
    expect(getRuleOptions(fakeContext([{ checkParams: true }]))).toEqual({ checkParams: true });
    expect(getRuleOptions(fakeContext([]))).toEqual({});
    expect(getRuleOptions(fakeContext(["error"]))).toEqual({});
  });
});

describe("getStringList", () => {
  it("prefers the rule option over shared settings", () => {
    const context = fakeContext([], { "cache-components": { requestApis: ["auth"] } });
    expect(getStringList(context, { requestApis: ["currentUser"] }, "requestApis")).toEqual([
      "currentUser",
    ]);
    expect(getStringList(context, {}, "requestApis")).toEqual(["auth"]);
  });

  it("returns undefined when neither source sets the option", () => {
    expect(getStringList(fakeContext([]), {}, "appDir")).toBeUndefined();
    expect(
      getStringList(fakeContext([], { "cache-components": {} }), {}, "appDir"),
    ).toBeUndefined();
  });

  it("rejects malformed settings with a clear error", () => {
    expect(() => getStringList(fakeContext([], { "cache-components": [] }), {}, "appDir")).toThrow(
      'settings["cache-components"] must be an object.',
    );
    expect(() =>
      getStringList(fakeContext([], { "cache-components": { appDir: "app" } }), {}, "appDir"),
    ).toThrow('settings["cache-components"].appDir must be an array of strings.');
  });
});

describe("getBoolean", () => {
  it("falls back when the option is missing", () => {
    expect(getBoolean({ checkParams: true }, "checkParams", false)).toBe(true);
    expect(getBoolean({}, "checkParams", false)).toBe(false);
  });
});

describe("textMentions", () => {
  it("checks whether any marker appears in the source text", () => {
    expect(textMentions('import { cookies } from "next/headers";', ["next/headers"])).toBe(true);
    expect(textMentions("const a = 1;", ["next/headers", "use cache"])).toBe(false);
  });
});
