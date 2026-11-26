import { noInvalidCacheNesting } from "../../src/rules/no-invalid-cache-nesting.ts";
import { createTester } from "../helpers/tester.ts";

const URL = "https://nextjs.org/docs/messages/use-cache-private-composition";

const RECOMMENDATIONS = `
import { cookies } from "next/headers";
async function Recommendations() {
  "use cache: private";
  const user = (await cookies()).get("uid");
  return <List items={await recommend(user)} />;
}`;

createTester().run("cache-components/no-invalid-cache-nesting", noInvalidCacheNesting, {
  valid: [
    {
      name: "a private function rendered outside the public cache",
      code: `${RECOMMENDATIONS}
async function CachedShell() { "use cache"; return <header />; }
export default async function Page() {
  return (
    <>
      <CachedShell />
      <Suspense><Recommendations /></Suspense>
    </>
  );
}`,
    },
    {
      name: "private inside private",
      code: `
async function getPrefs() { "use cache: private"; return 1; }
export async function getDashboard() { "use cache: private"; return getPrefs(); }`,
    },
    {
      name: "remote inside private with the option off",
      code: `
async function getCatalog() { "use cache: remote"; return []; }
export async function getDashboard() { "use cache: private"; return getCatalog(); }`,
    },
    {
      name: "a server action between the cache and the private function",
      code: `
async function getPrefs() { "use cache: private"; return 1; }
export async function Form() {
  "use cache";
  async function save() { "use server"; await getPrefs(); }
  return <form action={save} />;
}`,
    },
    {
      name: "a public cache nested in a public cache",
      code: `
async function getPrefs() { "use cache"; return 1; }
export async function getDashboard() { "use cache: remote"; return getPrefs(); }`,
    },
  ],
  invalid: [
    {
      name: "private inside public through JSX",
      code: `${RECOMMENDATIONS}
export default async function Page() {
  "use cache";
  return <Recommendations />;
}`,
      errors: [
        {
          message: `"use cache: private" function \`Recommendations\` can't be nested inside "use cache" function \`Page\` because a shared cached function can't depend on private request data. Nest it only inside another "use cache: private". See ${URL}`,
          line: 10,
        },
      ],
    },
    {
      name: "private inside public through a call",
      code: `
async function getPrefs() { "use cache: private"; return 1; }
export async function getHome() { "use cache"; return { prefs: await getPrefs() }; }`,
      errors: [
        {
          messageId: "privateInPublic",
          data: { inner: "getPrefs", outer: "getHome", outerScope: '"use cache"' },
        },
      ],
    },
    {
      name: "private inside remote",
      code: `
async function getPrefs() { "use cache: private"; return 1; }
export async function getHome() { "use cache: remote"; return getPrefs(); }`,
      errors: [
        {
          messageId: "privateInPublic",
          data: { inner: "getPrefs", outer: "getHome", outerScope: '"use cache: remote"' },
        },
      ],
    },
    {
      name: "private inside a file-level cached export",
      code: `
"use cache";
async function getPrefs() { "use cache: private"; return 1; }
export async function getHome() { return getPrefs(); }`,
      errors: [
        {
          messageId: "privateInPublic",
          data: { inner: "getPrefs", outer: "getHome", outerScope: '"use cache"' },
        },
      ],
    },
    {
      name: "private in an unstable_cache callback",
      code: `
import { unstable_cache } from "next/cache";
async function getPrefs() { "use cache: private"; return 1; }
export const getHome = unstable_cache(async () => ({ prefs: await getPrefs() }));`,
      errors: [
        {
          message: `"use cache: private" function \`getPrefs\` can't be used inside \`unstable_cache()\` because \`unstable_cache()\` uses a shared cache that can't contain private request data. Call it outside \`unstable_cache()\`. See ${URL}`,
        },
      ],
    },
    {
      name: "private reached from generateStaticParams",
      filename: "app/[locale]/page.tsx",
      code: `
async function getUserLocale() { "use cache: private"; return "en"; }
export async function generateStaticParams() {
  const locale = await getUserLocale();
  return [{ locale }];
}`,
      errors: [
        {
          message: `"use cache: private" function \`getUserLocale\` needs an active request, so it can't be used during \`generateStaticParams\`. Move it to a request-time component or function. See ${URL}`,
          line: 4,
        },
      ],
    },
    {
      name: "through an intermediate helper without a directive",
      code: `
async function getPrefs() { "use cache: private"; return 1; }
async function loadSidebar() { return getPrefs(); }
export async function getHome() { "use cache"; return loadSidebar(); }`,
      errors: [{ messageId: "privateInPublic", line: 4 }],
    },
    {
      name: "remote inside private with the option on",
      options: [{ checkRemoteInPrivate: true }],
      code: `
async function getCatalog() { "use cache: remote"; return []; }
export async function getDashboard() { "use cache: private"; return getCatalog(); }`,
      errors: [
        {
          message:
            '"use cache: remote" function `getCatalog` can\'t be nested inside "use cache: private" function `getDashboard`. See https://nextjs.org/docs/app/api-reference/directives/use-cache-remote',
        },
      ],
    },
    {
      name: "a function referenced by unstable_cache",
      code: `
import { unstable_cache } from "next/cache";
async function getPrefs() { "use cache: private"; return 1; }
async function load() { return getPrefs(); }
export const getHome = unstable_cache(load, ["home"]);`,
      errors: [{ messageId: "privateInUnstableCache", data: { inner: "getPrefs" } }],
    },
    {
      name: "private reached from unstable_generateParamMatching",
      filename: "app/[slug]/page.tsx",
      code: `
async function getPrefs() { "use cache: private"; return 1; }
export async function unstable_generateParamMatching() { await getPrefs(); return []; }`,
      errors: [
        {
          messageId: "privateInBuildTime",
          data: { inner: "getPrefs", generator: "unstable_generateParamMatching" },
        },
      ],
    },
    {
      name: "remote inside private through a helper",
      options: [{ checkRemoteInPrivate: true }],
      code: `
async function getCatalog() { "use cache: remote"; return []; }
async function load() { return getCatalog(); }
export async function getDashboard() { "use cache: private"; return load(); }`,
      errors: [
        { messageId: "remoteInPrivate", data: { inner: "getCatalog", outer: "getDashboard" } },
      ],
    },
    {
      name: "a private directive directly in an unstable_cache callback",
      code: `
import { unstable_cache } from "next/cache";
const getCachedData = unstable_cache(async () => {
  "use cache: private";
  return fetch("https://example.com").then((res) => res.json());
});`,
      errors: [{ messageId: "privateInUnstableCache", data: { inner: "getCachedData" }, line: 4 }],
    },
  ],
});
