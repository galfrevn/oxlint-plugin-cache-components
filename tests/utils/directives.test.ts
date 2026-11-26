import { describe, expect, it } from "vitest";

import { isFunctionNode, walk } from "../../src/utils/ast.ts";
import type { Directive } from "../../src/utils/directives.ts";
import {
  getFileDirective,
  getFunctionDirective,
  isPublicCacheKind,
  parseDirective,
} from "../../src/utils/directives.ts";
import { createProbe, probeCase } from "../helpers/probe.ts";
import { createTester } from "../helpers/tester.ts";

describe("parseDirective", () => {
  it.each([
    ["use cache", { type: "cache", kind: { type: "public" } }],
    ["use cache: default", { type: "cache", kind: { type: "public" } }],
    ["use cache: remote", { type: "cache", kind: { type: "remote" } }],
    ["use cache: private", { type: "cache", kind: { type: "private" } }],
    ["use cache: kv", { type: "cache", kind: { type: "custom", name: "kv" } }],
    ["use server", { type: "server" }],
    ["use client", { type: "client" }],
  ])("parses %j", (value, expected) => {
    expect(parseDirective(value)).toEqual(expected);
  });

  it.each([
    "use cache:remote",
    "use cache : remote",
    "use cache remote",
    "use cache: ",
    "use strict",
  ])("ignores %j", (value) => {
    expect(parseDirective(value)).toBeNull();
  });
});

describe("isPublicCacheKind", () => {
  it("treats public, remote, and custom kinds as shared caches", () => {
    expect(isPublicCacheKind({ type: "public" })).toBe(true);
    expect(isPublicCacheKind({ type: "remote" })).toBe(true);
    expect(isPublicCacheKind({ type: "custom", name: "kv" })).toBe(true);
    expect(isPublicCacheKind({ type: "private" })).toBe(false);
    expect(isPublicCacheKind({ type: "unstable" })).toBe(false);
  });
});

function describeDirective(directive: Directive | null): string {
  if (!directive) {
    return "none";
  }
  if (directive.type !== "cache") {
    return directive.type;
  }
  return directive.kind.type === "custom"
    ? `cache:${directive.kind.name}`
    : `cache:${directive.kind.type}`;
}

const probe = createProbe((context) => {
  const results = [`file=${describeDirective(getFileDirective(context.sourceCode.ast))}`];
  walk(
    context.sourceCode.ast,
    context.sourceCode.visitorKeys,
    (node) => {
      if (isFunctionNode(node)) {
        results.push(describeDirective(getFunctionDirective(node)));
      }
    },
    () => {},
  );
  return results;
});

createTester().run("directives", probe, {
  valid: [],
  invalid: [
    probeCase(`"use cache";\nexport async function a() {}`, ["file=cache:public", "none"], {
      name: "file-level double quotes",
    }),
    probeCase(`'use cache: remote';\nexport async function a() {}`, ["file=cache:remote", "none"], {
      name: "file-level single quotes",
    }),
    probeCase(
      `"use strict";\n"use server";\nexport async function a() {}`,
      ["file=server", "none"],
      {
        name: "directive after another prologue directive",
      },
    ),
    probeCase(`'use client';\nexport function a() {}`, ["file=client", "none"], {
      name: "client file",
    }),
    probeCase(`const x = 1;\n"use cache";\nexport async function a() {}`, ["file=none", "none"], {
      name: "loose string after a statement is not a directive",
    }),
    probeCase(
      `async function a() { "use cache: private"; }\nconst b = async () => { 'use cache'; };\nconst c = async function () { "use server"; };`,
      ["file=none", "cache:private", "cache:public", "server"],
      { name: "function directives" },
    ),
    probeCase(
      `async function a() { foo(); "use cache"; }\nconst b = async () => "use cache";`,
      ["file=none", "none", "none"],
      { name: "strings that are not in a function prologue" },
    ),
    probeCase(`async function a() { "use cache: kv"; }`, ["file=none", "cache:kv"], {
      name: "custom cache handler",
    }),
  ],
});
