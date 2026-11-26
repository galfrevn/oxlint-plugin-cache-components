import { noRequestApiInCache } from "../../src/rules/no-request-api-in-cache.ts";
import { createTester } from "../helpers/tester.ts";

const USE_CACHE_URL = "https://nextjs.org/docs/messages/next-request-in-use-cache";
const UNSTABLE_URL = "https://nextjs.org/docs/app/api-reference/functions/unstable_cache";

createTester().run("cache-components/no-request-api-in-cache", noRequestApiInCache, {
  valid: [
    {
      name: "value read outside and passed as an argument",
      code: `
import { cookies } from "next/headers";
export default async function Page() {
  const theme = (await cookies()).get("theme")?.value;
  return <Header theme={theme} />;
}
async function Header({ theme }: { theme?: string }) {
  "use cache";
  return <header data-theme={theme} />;
}`,
    },
    {
      name: "private caches allow cookies and headers",
      code: `
import { cookies, headers } from "next/headers";
export async function getCart() {
  "use cache: private";
  const agent = (await headers()).get("user-agent");
  return { cart: (await cookies()).get("cart"), agent };
}`,
    },
    {
      name: "reading draftMode().isEnabled is allowed",
      code: `
import { draftMode } from "next/headers";
export async function getPost(slug: string) {
  "use cache";
  const { isEnabled } = await draftMode();
  return isEnabled ? slug : null;
}`,
    },
    {
      name: "a shadowed cookies identifier",
      code: `
import { cookies } from "next/headers";
export async function getTheme(cookies: () => string) {
  "use cache";
  return cookies();
}`,
    },
    {
      name: "a cookies function from another module",
      code: `
import { cookies } from "./cookies";
export async function getTheme() {
  "use cache";
  return cookies();
}`,
    },
    {
      name: "searchParams declared but not read",
      filename: "app/search/page.tsx",
      code: `
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  "use cache";
  return <Results />;
}`,
    },
    {
      name: "searchParams read in an uncached page",
      filename: "app/search/page.tsx",
      code: `
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Results q={q} />;
}`,
    },
    {
      name: "a helper called only from an uncached function",
      code: `
import { cookies } from "next/headers";
async function getTheme() {
  return (await cookies()).get("theme")?.value;
}
export async function Header() {
  const theme = await getTheme();
  return <header data-theme={theme} />;
}`,
    },
    {
      name: "a helper passed as a callback has no call edge",
      code: `
import { cookies } from "next/headers";
async function readTheme() {
  return (await cookies()).get("theme")?.value;
}
export async function Header() {
  "use cache";
  return <Theme loader={readTheme} />;
}`,
    },
    {
      name: "a closure that reads cookies from the outer scope reads them outside the cache",
      code: `
import { cookies } from "next/headers";
export async function Page() {
  const store = await cookies();
  async function Header({ theme }: { theme?: string }) {
    "use cache";
    return <header data-theme={theme} />;
  }
  return <Header theme={store.get("theme")?.value} />;
}`,
    },
    {
      name: "a server action nested in a cached function is not cached",
      code: `
import { cookies } from "next/headers";
export async function Form() {
  "use cache";
  async function save() {
    "use server";
    (await cookies()).set("saved", "1");
  }
  return <form action={save} />;
}`,
    },
    {
      name: "transitive checks can be disabled",
      options: [{ checkTransitive: false }],
      code: `
import { cookies } from "next/headers";
async function getTheme() {
  return (await cookies()).get("theme")?.value;
}
export async function Header() {
  "use cache";
  return <header data-theme={await getTheme()} />;
}`,
    },
    {
      name: "an exported helper that reads cookies without a cached caller in the file",
      code: `
"use cache";
import { cookies } from "next/headers";
async function readTheme() {
  return (await cookies()).get("theme");
}`,
    },
    {
      name: "request in an uncached route handler",
      filename: "app/api/route.ts",
      code: `
export async function GET(request: Request) {
  return Response.json({ agent: request.headers.get("user-agent") });
}`,
    },
    {
      name: "a helper that reads cookies only in a branch",
      code: `
import { cookies } from "next/headers";
async function apiFetch({ query, withSession }: { query: string; withSession?: boolean }) {
  let session;
  if (withSession) {
    session = (await cookies()).get("token")?.value;
  }
  return fetch(query, { headers: session ? { Authorization: session } : {} });
}
export async function getMenu() {
  "use cache";
  return apiFetch({ query: "menu" });
}`,
    },
    {
      name: "a helper that may return before reading cookies",
      code: `
import { cookies } from "next/headers";
async function readTheme(fallback?: string) {
  if (fallback) return fallback;
  return (await cookies()).get("theme")?.value;
}
export async function Header() {
  "use cache";
  return <header data-theme={await readTheme("dark")} />;
}`,
    },
    {
      name: "a helper called only in a branch of an intermediate helper",
      code: `
import { headers } from "next/headers";
async function readLocale() { return (await headers()).get("accept-language"); }
async function resolveLocale(locale?: string) { return locale ?? (await readLocale()); }
export async function Greeting() {
  "use cache";
  return <p>{await resolveLocale("en")}</p>;
}`,
    },
    {
      name: "cookies read inside a callback of a helper",
      code: `
import { cookies } from "next/headers";
async function readAll(keys: string[]) {
  return Promise.all(keys.map(async (key) => (await cookies()).get(key)));
}
export async function Prefs() {
  "use cache";
  return readAll([]);
}`,
    },
    {
      name: "searchParams read in generateMetadata of a layout is out of scope",
      filename: "app/layout.tsx",
      code: `
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  "use cache";
  return { title: (await searchParams).title };
}`,
    },
  ],
  invalid: [
    {
      name: "cookies in use cache",
      code: `
import { cookies } from "next/headers";
export async function Header() {
  "use cache";
  const theme = (await cookies()).get("theme");
  return <header data-theme={theme?.value} />;
}`,
      errors: [
        {
          message: `\`cookies()\` can't be read inside "use cache". Read it outside the cached function and pass what you need as an argument. See ${USE_CACHE_URL}`,
          line: 5,
        },
      ],
    },
    {
      name: "headers in use cache: remote",
      code: `
import { headers } from "next/headers";
export async function getLocale() {
  "use cache: remote";
  return (await headers()).get("accept-language");
}`,
      errors: [
        {
          messageId: "requestApi",
          data: { api: "headers()", scope: '"use cache: remote"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "cookies in a custom cache handler",
      code: `
import { cookies } from "next/headers";
export async function getTheme() {
  "use cache: kv";
  return (await cookies()).get("theme");
}`,
      errors: [
        {
          messageId: "requestApi",
          data: { api: "cookies()", scope: '"use cache: kv"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "headers in an unstable_cache callback",
      code: `
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
export const getLocale = unstable_cache(async () => (await headers()).get("accept-language"));`,
      errors: [
        {
          message: `\`headers()\` can't be read inside \`unstable_cache()\`. Read it outside the cached function and pass what you need as an argument. See ${UNSTABLE_URL}`,
        },
      ],
    },
    {
      name: "connection in use cache",
      code: `
import { connection } from "next/server";
export async function getStats() {
  "use cache";
  await connection();
}`,
      errors: [
        {
          message: `\`connection()\` can't be called inside "use cache" because cached functions may run during prerendering, without an incoming request. Call it outside the cached function. See ${USE_CACHE_URL}`,
        },
      ],
    },
    {
      name: "connection in use cache: private",
      code: `
import { connection } from "next/server";
export async function getStats() {
  "use cache: private";
  await connection();
}`,
      errors: [
        {
          message:
            '`connection()` can\'t be called inside "use cache: private" because private cached functions may run during prefetching, without a navigation request. Call it outside the cached function. See https://nextjs.org/docs/app/api-reference/directives/use-cache-private',
        },
      ],
    },
    {
      name: "connection in unstable_cache",
      code: `
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
export const getStats = unstable_cache(async () => { await connection(); return 1; });`,
      errors: [
        { messageId: "connection", data: { scope: "`unstable_cache()`", url: UNSTABLE_URL } },
      ],
    },
    {
      name: "renamed import",
      code: `
import { cookies as readCookies } from "next/headers";
export async function getTheme() {
  "use cache";
  return (await readCookies()).get("theme");
}`,
      errors: [
        {
          messageId: "requestApi",
          data: { api: "cookies()", scope: '"use cache"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "namespace import",
      code: `
import * as nextHeaders from "next/headers";
export async function getTheme() {
  "use cache";
  return (await nextHeaders.cookies()).get("theme");
}`,
      errors: [{ messageId: "requestApi" }],
    },
    {
      name: "a nested callback inside a cached function",
      code: `
import { cookies } from "next/headers";
export async function getPrefs(keys: string[]) {
  "use cache";
  return Promise.all(keys.map(async (key) => (await cookies()).get(key)));
}`,
      errors: [{ messageId: "requestApi", line: 5 }],
    },
    {
      name: "file-level use cache and an export that reads cookies",
      code: `
"use cache";
import { cookies } from "next/headers";
export async function getTheme() {
  return (await cookies()).get("theme");
}`,
      errors: [
        {
          messageId: "requestApi",
          data: { api: "cookies()", scope: '"use cache"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "searchParams read in a cached page",
      filename: "app/search/page.tsx",
      code: `
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await searchParams;
  return <Results q={q} />;
}`,
      errors: [
        {
          message: `\`searchParams\` can't be read inside "use cache". Await it outside the cached function and pass what you need as an argument. See ${USE_CACHE_URL}`,
          line: 4,
        },
      ],
    },
    {
      name: "props.searchParams read in a file-level cached page",
      filename: "src/app/search/page.tsx",
      code: `
"use cache";
export default async function Page(props: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await props.searchParams;
  return <Results q={q} />;
}`,
      errors: [{ messageId: "searchParams" }],
    },
    {
      name: "draftMode().enable() inside use cache",
      code: `
import { draftMode } from "next/headers";
export async function preview() {
  "use cache";
  (await draftMode()).enable();
}`,
      errors: [
        {
          message: `\`draftMode().enable()\` can't be called inside "use cache". Draft mode can be read inside a cached function, but enabling or disabling it must happen outside. See ${USE_CACHE_URL}`,
        },
      ],
    },
    {
      name: "draftMode().disable() through a variable",
      code: `
import { draftMode } from "next/headers";
export async function exitPreview() {
  "use cache";
  const mode = await draftMode();
  mode.disable();
}`,
      errors: [
        {
          messageId: "draftModeMutation",
          data: { method: "disable", scope: '"use cache"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "a cached closure that reads request.headers in a route handler",
      filename: "app/api/posts/route.ts",
      code: `
export async function GET(request: Request) {
  async function load() {
    "use cache";
    return request.headers.get("x-tenant");
  }
  return Response.json(await load());
}`,
      errors: [
        {
          message: `\`request.headers\` can't be read inside "use cache". Read it outside the cached function and pass what you need as an argument. See ${USE_CACHE_URL}`,
        },
      ],
    },
    {
      name: "a cached route handler that reads req.nextUrl",
      filename: "src/app/api/posts/route.ts",
      code: `
export async function GET(req: Request) {
  "use cache";
  return Response.json({ path: req.nextUrl.pathname, body: await req.json() });
}`,
      errors: [
        {
          messageId: "routeHandlerRequest",
          data: { expression: "req.nextUrl", scope: '"use cache"', url: USE_CACHE_URL },
        },
        {
          messageId: "routeHandlerRequest",
          data: { expression: "req.json", scope: '"use cache"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "transitive through one helper",
      code: `
import { cookies } from "next/headers";

async function getTheme() {
  return (await cookies()).get("theme")?.value;
}

export async function Header() {
  "use cache";
  const theme = await getTheme();
  return <header data-theme={theme} />;
}`,
      errors: [
        {
          message: `\`getTheme()\` reads \`cookies()\` (line 5), and it's called inside "use cache" function \`Header\`. Read the value outside the cached function and pass it as an argument. See ${USE_CACHE_URL}`,
          line: 10,
        },
      ],
    },
    {
      name: "transitive through three levels",
      code: `
import { headers } from "next/headers";
async function readLocale() { return (await headers()).get("accept-language"); }
async function resolveLocale() { return readLocale(); }
async function formatGreeting() { return \`hello \${await resolveLocale()}\`; }
export async function Greeting() {
  "use cache";
  return <p>{await formatGreeting()}</p>;
}`,
      errors: [
        {
          messageId: "transitive",
          data: {
            helper: "readLocale",
            api: "headers()",
            line: 3,
            scope: '"use cache"',
            fn: "Greeting",
            url: USE_CACHE_URL,
          },
          line: 8,
        },
      ],
    },
    {
      name: "transitive through JSX",
      code: `
import { cookies } from "next/headers";
async function UserMenu() {
  const user = (await cookies()).get("user");
  return <nav>{user?.value}</nav>;
}
export async function Shell() {
  "use cache";
  return <UserMenu />;
}`,
      errors: [
        {
          messageId: "transitive",
          data: {
            helper: "UserMenu",
            api: "cookies()",
            line: 4,
            scope: '"use cache"',
            fn: "Shell",
            url: USE_CACHE_URL,
          },
        },
      ],
    },
    {
      name: "a cycle between helpers terminates",
      code: `
import { cookies } from "next/headers";
async function a(depth: number): Promise<string | undefined> {
  const value = (await cookies()).get("a")?.value;
  if (depth > 0) return b(depth - 1);
  return value;
}
async function b(depth: number): Promise<string | undefined> {
  return a(depth);
}
export async function Cached() {
  "use cache";
  return a(2);
}`,
      errors: [
        {
          messageId: "transitive",
          data: {
            helper: "a",
            api: "cookies()",
            line: 4,
            scope: '"use cache"',
            fn: "Cached",
            url: USE_CACHE_URL,
          },
        },
      ],
    },
    {
      name: "one report per cached function and API",
      code: `
import { cookies } from "next/headers";
async function first() { return (await cookies()).get("a"); }
async function second() { return (await cookies()).get("b"); }
export async function Cached() {
  "use cache";
  return [await first(), await second()];
}`,
      errors: [
        {
          messageId: "transitive",
          data: {
            helper: "first",
            api: "cookies()",
            line: 3,
            scope: '"use cache"',
            fn: "Cached",
            url: USE_CACHE_URL,
          },
        },
      ],
    },
    {
      name: "transitive connection inside a private cache",
      code: `
import { connection } from "next/server";
import { cookies } from "next/headers";
async function readFresh() {
  const store = await cookies();
  await connection();
  return store.get("a");
}
export async function Cached() {
  "use cache: private";
  return readFresh();
}`,
      errors: [
        {
          messageId: "transitive",
          data: {
            helper: "readFresh",
            api: "connection()",
            line: 6,
            scope: '"use cache: private"',
            fn: "Cached",
            url: "https://nextjs.org/docs/app/api-reference/directives/use-cache-private",
          },
        },
      ],
    },
    {
      name: "requestApis option",
      options: [{ requestApis: ["auth"] }],
      code: `
import { auth } from "@/auth";
export async function getDashboard() {
  "use cache";
  const session = await auth();
  return session?.user;
}`,
      errors: [
        {
          messageId: "requestApi",
          data: { api: "auth()", scope: '"use cache"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "requestApis from shared settings",
      settings: { "cache-components": { requestApis: ["@clerk/nextjs/server:currentUser"] } },
      code: `
import { currentUser } from "@clerk/nextjs/server";
export async function getProfile() {
  "use cache";
  return currentUser();
}`,
      errors: [
        {
          messageId: "requestApi",
          data: { api: "currentUser()", scope: '"use cache"', url: USE_CACHE_URL },
        },
      ],
    },
    {
      name: "connection through a namespace import inside a private cache",
      code: `
import * as server from "next/server";
export async function getStats() {
  "use cache: private";
  await server.connection();
}`,
      errors: [{ messageId: "connectionPrivate" }],
    },
    {
      name: "a helper that reads cookies inside a try block",
      code: `
import { cookies } from "next/headers";
async function Child() {
  let name;
  try {
    name = (await cookies()).get("name")?.value;
  } catch {
    name = "nobody";
  }
  return <p>{name}</p>;
}
export async function Cached() {
  "use cache";
  return <Child />;
}`,
      errors: [
        {
          messageId: "transitive",
          data: {
            helper: "Child",
            api: "cookies()",
            line: 6,
            scope: '"use cache"',
            fn: "Cached",
            url: USE_CACHE_URL,
          },
        },
      ],
    },
    {
      name: "searchParams read in a cached generateMetadata",
      filename: "app/search/page.tsx",
      code: `
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  "use cache";
  const title = (await searchParams).title;
  return { title };
}
export default function Page() {
  return null;
}`,
      errors: [{ messageId: "searchParams", line: 4 }],
    },
    {
      name: "searchParams read in a cached generateViewport",
      filename: "app/search/page.tsx",
      code: `
export async function generateViewport(props: { searchParams: Promise<Record<string, string>> }) {
  "use cache";
  return { themeColor: (await props.searchParams).color };
}`,
      errors: [{ messageId: "searchParams", line: 4 }],
    },
    {
      name: "searchParams read by a cached closure inside a page",
      filename: "app/search/page.tsx",
      code: `
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  async function Results() {
    "use cache";
    const { q } = await searchParams;
    return <List q={q} />;
  }
  return <Results />;
}`,
      errors: [{ messageId: "searchParams", line: 5 }],
    },
    {
      name: "draftMode().enable() inside use cache: private",
      code: `
import { draftMode } from "next/headers";
export async function preview() {
  "use cache: private";
  (await draftMode()).enable();
}`,
      errors: [
        {
          messageId: "draftModeMutation",
          data: { method: "enable", scope: '"use cache: private"', url: USE_CACHE_URL },
        },
      ],
    },
  ],
});
