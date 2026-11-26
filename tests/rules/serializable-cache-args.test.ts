import { serializableCacheArgs } from "../../src/rules/serializable-cache-args.ts";
import { createTester } from "../helpers/tester.ts";

const URL = "https://nextjs.org/docs/app/api-reference/directives/use-cache";
const GET_PAGE = `async function getPage(value: unknown) { "use cache"; return String(value); }\n`;

createTester().run("cache-components/serializable-cache-args", serializableCacheArgs, {
  valid: [
    {
      name: "serializable values",
      code: `${GET_PAGE}export async function load(request: Request) {
  await getPage(new Date());
  await getPage(new Map([["a", 1]]));
  await getPage(new Set([1]));
  await getPage(new URL(request.url).pathname);
  await getPage({ id: 1 });
}`,
    },
    {
      name: "a non-serializable value passed to an uncached function",
      code: `async function log(value: unknown) { return value; }\nexport async function load() { await log(new URL("https://example.com")); }`,
    },
    {
      name: "a local Symbol function is not the global",
      code: `${GET_PAGE}function Symbol(name: string) { return name; }\nexport async function load() { await getPage(Symbol("a")); }`,
    },
    {
      name: "request in a file that is not a route handler",
      filename: "lib/request.ts",
      code: `${GET_PAGE}export async function POST(request: Request) { await getPage(request); }`,
    },
  ],
  invalid: [
    {
      name: "a URL instance",
      code: `${GET_PAGE}export async function load() { await getPage(new URL("https://example.com/a")); }`,
      errors: [
        {
          message: `\`new URL("https://example.com/a")\` can't be serialized as an argument to "use cache" \`getPage\` (URL instance). Pass plain data instead, such as strings, numbers or plain objects. See ${URL}`,
        },
      ],
    },
    {
      name: "class instances declared in the file and imported",
      code: `import { Client } from "./client";\nclass UserService {}\n${GET_PAGE}export async function load() {\n  await getPage(new UserService());\n  await getPage(new Client());\n}`,
      errors: [
        {
          messageId: "nonSerializable",
          data: {
            expr: "new UserService()",
            scope: '"use cache"',
            fn: "getPage",
            reason: "class instance",
          },
        },
        {
          messageId: "nonSerializable",
          data: {
            expr: "new Client()",
            scope: '"use cache"',
            fn: "getPage",
            reason: "class instance",
          },
        },
      ],
    },
    {
      name: "Symbol, Symbol.for, WeakMap, WeakSet, and this",
      code: `${GET_PAGE}export async function load(this: unknown) {\n  await getPage(Symbol("a"));\n  await getPage(Symbol.for("b"));\n  await getPage(new WeakMap());\n  await getPage(new WeakSet());\n  await getPage(this);\n}`,
      errors: [
        {
          messageId: "nonSerializable",
          data: { expr: 'Symbol("a")', scope: '"use cache"', fn: "getPage", reason: "Symbol" },
        },
        {
          messageId: "nonSerializable",
          data: { expr: 'Symbol.for("b")', scope: '"use cache"', fn: "getPage", reason: "Symbol" },
        },
        {
          messageId: "nonSerializable",
          data: { expr: "new WeakMap()", scope: '"use cache"', fn: "getPage", reason: "WeakMap" },
        },
        {
          messageId: "nonSerializable",
          data: { expr: "new WeakSet()", scope: '"use cache"', fn: "getPage", reason: "WeakSet" },
        },
        {
          messageId: "nonSerializable",
          data: { expr: "this", scope: '"use cache"', fn: "getPage", reason: "`this`" },
        },
      ],
    },
    {
      name: "the request and its headers in a route handler",
      filename: "app/api/route.ts",
      code: `${GET_PAGE}export async function POST(req: Request) {\n  await getPage(req);\n  await getPage(req.headers);\n  return Response.json({});\n}`,
      errors: [
        {
          messageId: "nonSerializable",
          data: { expr: "req", scope: '"use cache"', fn: "getPage", reason: "Request object" },
        },
        {
          messageId: "nonSerializable",
          data: {
            expr: "req.headers",
            scope: '"use cache"',
            fn: "getPage",
            reason: "Headers object",
          },
        },
      ],
    },
    {
      name: "a JSX prop of a cached component",
      code: `async function Card({ url }: { url: unknown }) { "use cache: remote"; return <a href={String(url)} />; }\nexport function Page() { return <Card url={new URL("https://example.com")} />; }`,
      errors: [
        {
          messageId: "nonSerializable",
          data: {
            expr: 'new URL("https://example.com")',
            scope: '"use cache: remote"',
            fn: "Card",
            reason: "URL instance",
          },
        },
      ],
    },
  ],
});
