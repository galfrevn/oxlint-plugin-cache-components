import { noPromiseArgsToCache } from "../../src/rules/no-promise-args-to-cache.ts";
import { createTester } from "../helpers/tester.ts";

const RESULTS = `
async function Results({ query }: { query: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await query;
  return <List items={await search(q)} />;
}`;

const POST = `
async function Post({ params }: { params: Promise<{ slug: string }> }) {
  "use cache";
  return <article>{(await params).slug}</article>;
}`;

createTester().run("cache-components/no-promise-args-to-cache", noPromiseArgsToCache, {
  valid: [
    {
      name: "resolved values passed to a cached component",
      filename: "app/search/page.tsx",
      code: `
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Results q={q} />;
}
async function Results({ q }: { q?: string }) { "use cache"; return <List q={q} />; }`,
    },
    {
      name: "a promise passed to an uncached child",
      filename: "app/blog/[slug]/page.tsx",
      code: `
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense><Post params={params} /></Suspense>;
}
async function Post({ params }: { params: Promise<{ slug: string }> }) {
  return <article>{(await params).slug}</article>;
}`,
    },
    {
      name: "awaited cookies",
      code: `
import { cookies } from "next/headers";
export default async function Page() {
  return <Prefs store={await cookies()} />;
}
async function Prefs({ store }: { store: unknown }) { "use cache"; return <div />; }`,
    },
    {
      name: "a variable bound to awaited headers",
      code: `
import { headers } from "next/headers";
export default async function Page() {
  const h = await headers();
  return <Agent h={h} />;
}
async function Agent({ h }: { h: unknown }) { "use cache"; return <div />; }`,
    },
    {
      name: "a props spread is not provable",
      filename: "app/search/page.tsx",
      code: `
export default function Page(props: { searchParams: Promise<{ q?: string }> }) {
  return <Results {...props} />;
}${RESULTS}`,
    },
    {
      name: "params with checkParams off",
      filename: "app/blog/[slug]/page.tsx",
      code: `
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Post params={params} />;
}${POST}`,
    },
    {
      name: "a private cache is out of scope",
      code: `
import { cookies } from "next/headers";
export default async function Page() {
  return <Prefs store={cookies()} />;
}
async function Prefs({ store }: { store: unknown }) { "use cache: private"; return <div />; }`,
    },
    {
      name: "searchParams outside a segment file",
      filename: "components/search.tsx",
      code: `
export function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Results query={searchParams} />;
}${RESULTS}`,
    },
    {
      name: "a captured value that was awaited",
      code: `
import { cookies } from "next/headers";
export default async function Page() {
  const store = await cookies();
  async function Prefs() {
    "use cache";
    return <p>{store.get("theme")?.value}</p>;
  }
  return <Prefs />;
}`,
    },
    {
      name: "a local helper that reads cookies only in a branch",
      code: `
import { cookies } from "next/headers";
async function readTheme(fromCookie: boolean) {
  if (fromCookie) return (await cookies()).get("theme")?.value;
  return "light";
}
async function Header({ theme }: { theme: Promise<string | undefined> }) { "use cache"; return <h1>{await theme}</h1>; }
export default function Page() {
  return <Header theme={readTheme(false)} />;
}`,
    },
  ],
  invalid: [
    {
      name: "searchParams through JSX",
      filename: "app/search/page.tsx",
      code: `
export default function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Results query={searchParams} />;
}${RESULTS}`,
      errors: [
        {
          message:
            '`searchParams` is a Promise of request-time data passed to "use cache" `Results`. Await it outside and pass the resolved values, or the cache can\'t fill during prerender and the build times out after 50 seconds. See https://nextjs.org/docs/app/api-reference/directives/use-cache',
          line: 3,
        },
      ],
    },
    {
      name: "searchParams through a call",
      filename: "app/search/page.tsx",
      code: `
async function search(params: Promise<{ q?: string }>) {
  "use cache: remote";
  return (await params).q;
}
export default async function Page(props: { searchParams: Promise<{ q?: string }> }) {
  return <p>{await search(props.searchParams)}</p>;
}`,
      errors: [
        {
          messageId: "promiseArg",
          data: { arg: "props.searchParams", scope: '"use cache: remote"', fn: "search" },
        },
      ],
    },
    {
      name: "cookies() without await",
      code: `
import { cookies } from "next/headers";
export default async function Page() {
  return <Prefs store={cookies()} />;
}
async function Prefs({ store }: { store: unknown }) { "use cache"; return <div />; }`,
      errors: [
        { messageId: "promiseArg", data: { arg: "cookies()", scope: '"use cache"', fn: "Prefs" } },
      ],
    },
    {
      name: "a variable bound to headers() without await",
      code: `
import { headers } from "next/headers";
export default async function Page() {
  const h = headers();
  return <Agent h={h} />;
}
async function Agent({ h }: { h: unknown }) { "use cache"; return <div />; }`,
      errors: [{ messageId: "promiseArg", data: { arg: "h", scope: '"use cache"', fn: "Agent" } }],
    },
    {
      name: "params with checkParams on",
      filename: "app/blog/[slug]/page.tsx",
      options: [{ checkParams: true }],
      code: `
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Post params={params} />;
}${POST}`,
      errors: [
        { messageId: "promiseArg", data: { arg: "params", scope: '"use cache"', fn: "Post" } },
      ],
    },
    {
      name: "a custom request API from requestApis",
      options: [{ requestApis: ["auth"] }],
      code: `
import { auth } from "@/auth";
async function Dashboard({ session }: { session: unknown }) { "use cache"; return <div />; }
export default function Page() {
  return <Dashboard session={auth()} />;
}`,
      errors: [
        { messageId: "promiseArg", data: { arg: "auth()", scope: '"use cache"', fn: "Dashboard" } },
      ],
    },
    {
      name: "a cached closure that captures a promise from a helper that awaits connection()",
      code: `
import { connection } from "next/server";
async function fetchUncachedData() {
  await connection();
  return Math.random();
}
export default async function Page() {
  const uncachedDataPromise = fetchUncachedData();
  const Foo = async () => {
    "use cache";
    return <p>{await uncachedDataPromise}</p>;
  };
  return <Foo />;
}`,
      errors: [
        {
          message:
            '`uncachedDataPromise` is a Promise of request-time data that "use cache" function `Foo` captures from the enclosing function. Await it outside and pass the resolved value as an argument, or the cache can\'t fill during prerender and the build times out after 50 seconds. See https://nextjs.org/docs/app/api-reference/directives/use-cache',
          line: 11,
        },
      ],
    },
    {
      name: "a cached closure that captures cookies() without await",
      code: `
import { cookies } from "next/headers";
export default async function Page() {
  const store = cookies();
  async function Prefs() {
    "use cache";
    return <p>{(await store).get("theme")?.value}</p>;
  }
  return <Prefs />;
}`,
      errors: [
        { messageId: "capturedPromise", data: { arg: "store", scope: '"use cache"', fn: "Prefs" } },
      ],
    },
    {
      name: "a call to a local helper that reads headers passed without await",
      code: `
import { headers } from "next/headers";
async function readLocale() {
  return (await headers()).get("accept-language");
}
async function Greeting({ locale }: { locale: Promise<string | null> }) { "use cache"; return <p>{await locale}</p>; }
export default function Page() {
  return <Greeting locale={readLocale()} />;
}`,
      errors: [
        {
          messageId: "promiseArg",
          data: { arg: "readLocale()", scope: '"use cache"', fn: "Greeting" },
        },
      ],
    },
  ],
});
