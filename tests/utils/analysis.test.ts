import { defineRule } from "@oxlint/plugins";
import { describe, expect, it } from "vitest";

import type { FileAnalysis } from "../../src/utils/analysis.ts";
import { getFileAnalysis } from "../../src/utils/analysis.ts";
import { walk } from "../../src/utils/ast.ts";
import { scopeLabel } from "../../src/utils/messages.ts";
import { analyzeForTest } from "../helpers/analysis.ts";
import { createProbe, probeCase } from "../helpers/probe.ts";
import { createTester } from "../helpers/tester.ts";

function describeMarkedCalls(
  analysis: FileAnalysis,
  render: (analysis: FileAnalysis, node: Parameters<FileAnalysis["unitAt"]>[0]) => string,
): string[] {
  const results: string[] = [];
  walk(
    analysis.sourceCode.ast,
    analysis.sourceCode.visitorKeys,
    (node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name.startsWith("mark")
      ) {
        results.push(`${node.callee.name}=${render(analysis, node)}`);
      }
    },
    () => {},
  );
  return results;
}

const scopeProbe = createProbe((context) =>
  describeMarkedCalls(analyzeForTest(context), (current, node) => {
    const scope = current.getCacheScope(node);
    if (!scope) {
      return "none";
    }
    return `${scopeLabel(scope.kind)} via ${scope.via} in ${current.functions.get(scope.owner)?.name}`;
  }),
);

const originProbe = createProbe((context) =>
  describeMarkedCalls(analyzeForTest(context), (current, node) =>
    current
      .getContextOrigins(node)
      .map((origin) => `${origin.context}${origin.fn ? `(${origin.fn.name})` : ""}`)
      .join("|"),
  ),
);

const tester = createTester();

tester.run("cache scope", scopeProbe, {
  valid: [],
  invalid: [
    probeCase(
      `async function a() { "use cache"; markA(); [1].map(() => markNested()); }\nasync function b() { markB(); }`,
      [
        'markA="use cache" via function in a',
        'markNested="use cache" via function in a',
        "markB=none",
      ],
      { name: "function directive and nested callbacks" },
    ),
    probeCase(
      `"use cache: remote";\nexport async function a() { markA(); }\nasync function b() { markB(); }`,
      ['markA="use cache: remote" via file in a', "markB=none"],
      { name: "file directive covers exports only" },
    ),
    probeCase(
      `import { unstable_cache } from "next/cache";\nexport const a = unstable_cache(async () => { markA(); });\nasync function load() { markB(); }\nexport const b = unstable_cache(load, ["b"]);`,
      [
        "markA=`unstable_cache()` via unstable_cache in a",
        "markB=`unstable_cache()` via unstable_cache in load",
      ],
      { name: "unstable_cache callbacks" },
    ),
    probeCase(
      `async function a() { "use cache"; async function act() { "use server"; markA(); } }`,
      ["markA=none"],
      { name: "a nested server action stops the scope" },
    ),
    probeCase(
      `async function a() { "use cache: private"; markA(); }\nasync function b() { "use cache: kv"; markB(); }`,
      ['markA="use cache: private" via function in a', 'markB="use cache: kv" via function in b'],
      { name: "private and custom kinds" },
    ),
  ],
});

tester.run("context origins", originProbe, {
  valid: [],
  invalid: [
    probeCase(
      `"use server";\nfunction helper() { markHelper(); }\nexport async function save() { helper(); markSave(); }`,
      ["markHelper=server-action(save)", "markSave=server-action(save)"],
      { name: "helpers inherit the contexts of their callers", filename: "app/actions.ts" },
    ),
    probeCase(
      `function helper() { markHelper(); }\nexport async function getPosts() { "use cache"; helper(); }\nexport default async function Page() { helper(); return <main />; }`,
      ["markHelper=cached(getPosts)|component-render(Page)"],
      { name: "a helper reached from several contexts", filename: "app/page.tsx" },
    ),
    probeCase(
      `export function helper() { markHelper(); }\nfunction unused() { markUnused(); }`,
      ["markHelper=unknown", "markUnused=unknown"],
      { name: "exported helpers and helpers without callers are unknown" },
    ),
    probeCase(
      `export function helper() { markHelper(); }\nexport default async function Page() { helper(); return <main />; }`,
      ["markHelper=component-render(Page)|unknown"],
      { name: "exported helpers keep an unknown origin", filename: "app/page.tsx" },
    ),
    probeCase(
      `export async function POST() { const purge = async () => { markPurge(); }; await purge(); const later = () => { markLater(); }; }`,
      ["markPurge=route-handler(POST)", "markLater=route-handler(POST)"],
      { name: "local helpers inherit the enclosing function", filename: "app/api/route.ts" },
    ),
    probeCase(
      `import { after } from "next/server";\nexport async function POST() { after(() => { markAfter(); }); return <button onClick={() => markClick()} />; }`,
      ["markAfter=unknown", "markClick=unknown"],
      { name: "after callbacks and JSX handlers are opaque", filename: "app/api/route.tsx" },
    ),
    probeCase(`function a() { b(); markA(); }\nfunction b() { a(); }`, ["markA=unknown"], {
      name: "cycles terminate",
    }),
  ],
});

const analyses: FileAnalysis[] = [];

const memoizationRule = defineRule({
  meta: { messages: { m: "{{shared}}" } },
  createOnce(context) {
    return {
      "Program:exit"(node) {
        const input = {
          sourceCode: context.sourceCode,
          filename: context.filename,
          cwd: context.cwd,
        };
        const first = getFileAnalysis(input, { appDirs: ["app"], requestApis: [] });
        const second = getFileAnalysis(input, { appDirs: ["app"], requestApis: [] });
        const other = getFileAnalysis(input, { appDirs: ["app"], requestApis: ["auth"] });
        analyses.push(first);
        context.report({
          node,
          messageId: "m",
          data: { shared: String(first === second && first !== other) },
        });
      },
    };
  },
});

tester.run("memoization", memoizationRule, {
  valid: [],
  invalid: [
    { code: "const a = 1;", errors: [{ message: "true" }] },
    { code: "const b = 2;", errors: [{ message: "true" }] },
  ],
});

describe("getFileAnalysis memoization", () => {
  it("builds a separate analysis for each file", () => {
    expect(new Set(analyses).size).toBe(analyses.length);
  });
});

const contextProbe = createProbe((context) => {
  const analysis = analyzeForTest(context);
  return [
    `file=${analysis.file.kind}`,
    ...analysis.units.map((unit) => `${unit.name}=${unit.context}`),
  ];
});

tester.run("function contexts", contextProbe, {
  valid: [],
  invalid: [
    probeCase(
      `"use server";\nexport async function save() {}\nexport const remove = async () => {};\nasync function helper() {}`,
      ["file=server-actions", "save=server-action", "remove=server-action", "helper=unknown"],
      { name: "file-level server actions", filename: "app/actions.ts" },
    ),
    probeCase(
      `export default async function Page() {\n  async function save() { "use server"; }\n  return <form action={save} />;\n}`,
      ["file=segment", "Page=component-render", "save=server-action"],
      { name: "inline server action", filename: "app/page.tsx" },
    ),
    probeCase(
      `export async function GET() {}\nexport const POST = async () => {};\nexport async function helper() {}`,
      ["file=route-handler", "GET=route-handler", "POST=route-handler", "helper=unknown"],
      { name: "route handler methods", filename: "app/api/route.ts" },
    ),
    probeCase(
      `export async function generateStaticParams() { return []; }\nexport async function generateMetadata() { return {}; }\nexport async function generateViewport() { return {}; }\nexport default function Page() { return <main />; }`,
      [
        "file=segment",
        "generateStaticParams=build-time-generator",
        "generateMetadata=metadata",
        "generateViewport=metadata",
        "Page=component-render",
      ],
      { name: "segment exports", filename: "src/app/blog/[slug]/page.tsx" },
    ),
    probeCase(
      `function Card() { return <div />; }\nconst Badge = () => <span />;\nfunction formatDate() { return "x"; }`,
      ["file=other", "Card=component-render", "Badge=component-render", "formatDate=unknown"],
      { name: "server components outside segment files", filename: "components/card.tsx" },
    ),
    probeCase(
      `"use client";\nexport function Button() { return <button />; }\nfunction handler() {}`,
      ["file=client", "Button=client", "handler=client"],
      { name: "client file", filename: "components/button.tsx" },
    ),
    probeCase(
      `export function proxy() {}\nfunction helper() {}`,
      ["file=proxy", "proxy=proxy", "helper=proxy"],
      { name: "proxy file", filename: "proxy.ts" },
    ),
    probeCase(
      `export async function getPosts() { "use cache"; }\nexport default async function Page() { "use cache: private"; return <main />; }`,
      ["file=segment", "getPosts=cached", "Page=cached"],
      { name: "cached functions", filename: "app/page.tsx" },
    ),
    probeCase(
      `"use server";\nexport const save = withAuth(async () => {});\nexport const act = client.inputSchema(schema).action(async ({ parsedInput }) => {});`,
      ["file=server-actions", "save=server-action", "act=server-action"],
      { name: "wrapped server actions", filename: "app/actions.ts" },
    ),
  ],
});

const edgeProbe = createProbe((context) => {
  const analysis = analyzeForTest(context);
  return analysis.callGraph.sites.map((site) => {
    const caller = site.caller ? analysis.functions.get(site.caller)?.name : "<module>";
    const callee = analysis.functions.get(site.callee)?.name;
    const kind = site.node.type === "JSXOpeningElement" ? "jsx" : site.awaited ? "await" : "call";
    return `${caller}-${kind}->${callee}`;
  });
});

tester.run("call graph edges", edgeProbe, {
  valid: [],
  invalid: [
    probeCase(
      `async function load() { return 1; }\nconst format = (value: number) => String(value);\nasync function Page() { const v = await load(); return <Card value={format(v)} />; }\nfunction Card() { return <div />; }\nload();`,
      ["Page-await->load", "Page-call->format", "<module>-call->load", "Page-jsx->Card"],
      { name: "calls, awaits, and JSX" },
    ),
    probeCase(
      `async function a() { await b(); }\nasync function b() { await a(); }`,
      ["a-await->b", "b-await->a"],
      { name: "cycles" },
    ),
    probeCase(
      `import { cache } from "react";\nconst getUser = cache(async () => 1);\nasync function Page() { await getUser(); }`,
      ["Page-await->getUser"],
      { name: "React.cache wrappers are transparent" },
    ),
    probeCase(
      `async function Page(items: number[]) { await Promise.all(items.map(async (item) => load(item))); }\nasync function load(item: number) { return item; }`,
      ["Page-call->load"],
      { name: "calls inside callbacks belong to the enclosing function" },
    ),
    probeCase(
      `function Page() { const load = (x: number) => x; return [1].map(load); }\nconst obj = { run() {} };\nobj.run();\nlet later = () => 1;\nlater = () => 2;\nlater();`,
      [],
      { name: "no edges for references, methods, or reassigned bindings" },
    ),
    probeCase(
      `function Page() { function Inner() { return <i />; } return <Inner />; }\nconst Shadow = 1;\nfunction Other() { const Inner = () => <b />; return <Inner />; }`,
      ["Page-jsx->Inner", "Other-jsx->Inner"],
      { name: "JSX resolves by scope" },
    ),
  ],
});
