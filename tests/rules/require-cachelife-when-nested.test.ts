import { requireCacheLifeWhenNested } from "../../src/rules/require-cachelife-when-nested.ts";
import { createTester } from "../helpers/tester.ts";

const URL = "https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife";

createTester().run("cache-components/require-cachelife-when-nested", requireCacheLifeWhenNested, {
  valid: [
    {
      name: "the outer function sets its lifetime explicitly",
      code: `
import { cacheLife } from "next/cache";
async function StockTicker() {
  "use cache";
  cacheLife("seconds");
  return <span>{await getPrice()}</span>;
}
export default async function ProductPage() {
  "use cache";
  cacheLife("minutes");
  return <main><StockTicker /></main>;
}`,
    },
    {
      name: "the inner function is not short-lived",
      code: `
import { cacheLife } from "next/cache";
async function Catalog() { "use cache"; cacheLife("hours"); return <ul />; }
export default async function Page() { "use cache"; return <Catalog />; }`,
    },
    {
      name: "expire of exactly 300 seconds is not short",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ expire: 300 }); return 1; }
export async function dashboard() { "use cache"; return { live: await live() }; }`,
    },
    {
      name: "the outer function sets cacheLife in only one branch",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife("seconds"); return 1; }
export async function dashboard(fast: boolean) {
  "use cache";
  if (fast) cacheLife("seconds");
  return live();
}`,
    },
    {
      name: "the outer function sets cacheLife through a helper",
      code: `
import { cacheLife } from "next/cache";
function keepFresh() { cacheLife("minutes"); }
async function live() { "use cache"; cacheLife("seconds"); return 1; }
export async function dashboard() { "use cache"; keepFresh(); return live(); }`,
    },
    {
      name: "a cacheLife argument that cannot be evaluated",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife(profile); return 1; }
export async function dashboard() { "use cache"; return live(); }`,
    },
    {
      name: "a custom profile that is not configured as short",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife("live"); return 1; }
export async function dashboard() { "use cache"; return live(); }`,
    },
    {
      name: "the outer function is not cached",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife("seconds"); return 1; }
export async function dashboard() { return live(); }`,
    },
    {
      name: "a private inner function is out of scope",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache: private"; cacheLife("seconds"); return 1; }
export async function dashboard() { "use cache"; return live(); }`,
    },
    {
      name: "through a helper with followHelpers disabled",
      options: [{ followHelpers: false }],
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife("seconds"); return 1; }
async function load() { return live(); }
export async function dashboard() { "use cache"; return load(); }`,
    },
  ],
  invalid: [
    {
      name: "the outer function renders a seconds inner function through JSX",
      code: `
import { cacheLife } from "next/cache";

async function StockTicker() {
  "use cache";
  cacheLife("seconds");
  return <span>{await getPrice()}</span>;
}

export default async function ProductPage() {
  "use cache";
  return <main><StockTicker /></main>;
}`,
      errors: [
        {
          message: `"use cache" function \`ProductPage\` has no \`cacheLife()\`, but it calls \`StockTicker\`, whose \`expire\` is under 5 minutes (\`cacheLife("seconds")\`). Add \`cacheLife()\` to \`ProductPage\` to choose whether to prerender it with a longer \`expire\` or keep it dynamic. See ${URL}`,
          line: 11,
          suggestions: [
            {
              messageId: "addCacheLifeShort",
              data: { call: 'cacheLife("seconds")', outer: "ProductPage" },
              output: `
import { cacheLife } from "next/cache";

async function StockTicker() {
  "use cache";
  cacheLife("seconds");
  return <span>{await getPrice()}</span>;
}

export default async function ProductPage() {
  "use cache";
  cacheLife("seconds");
  return <main><StockTicker /></main>;
}`,
            },
            {
              messageId: "addCacheLifeMinutes",
              data: { call: 'cacheLife("minutes")', outer: "ProductPage" },
              output: `
import { cacheLife } from "next/cache";

async function StockTicker() {
  "use cache";
  cacheLife("seconds");
  return <span>{await getPrice()}</span>;
}

export default async function ProductPage() {
  "use cache";
  cacheLife("minutes");
  return <main><StockTicker /></main>;
}`,
            },
          ],
        },
      ],
    },
    {
      name: "a call to an inner function with revalidate: 0",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ revalidate: 0 }); return now(); }
export async function dashboard() { "use cache"; return { live: await live() }; }`,
      errors: [
        {
          message: `"use cache" function \`dashboard\` has no \`cacheLife()\`, but it calls \`live\`, which uses \`revalidate: 0\`. Add \`cacheLife()\` to \`dashboard\` to choose whether to prerender it with a non-zero \`revalidate\` or keep it dynamic. See ${URL}`,
          suggestions: [
            {
              messageId: "addCacheLifeShort",
              output: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ revalidate: 0 }); return now(); }
export async function dashboard() { "use cache"; cacheLife({ revalidate: 0 }); return { live: await live() }; }`,
            },
            {
              messageId: "addCacheLifeMinutes",
              output: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ revalidate: 0 }); return now(); }
export async function dashboard() { "use cache"; cacheLife("minutes"); return { live: await live() }; }`,
            },
          ],
        },
      ],
    },
    {
      name: "expire under 300 seconds",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ expire: 299 }); return 1; }
export async function dashboard() { "use cache"; return live(); }`,
      errors: [
        {
          messageId: "shortExpire",
          data: { outer: "dashboard", inner: "live", profile: "`cacheLife({ expire: 299 })`" },
        },
      ],
    },
    {
      name: "one short call among several branches is enough",
      code: `
import { cacheLife } from "next/cache";
async function live(fast: boolean) { "use cache"; if (fast) cacheLife("seconds"); else cacheLife("days"); return 1; }
export async function dashboard() { "use cache"; return live(true); }`,
      errors: [{ messageId: "shortExpire" }],
    },
    {
      name: "through a helper without a directive",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife("seconds"); return 1; }
async function load() { return live(); }
export async function dashboard() { "use cache"; return load(); }`,
      errors: [
        {
          messageId: "shortExpire",
          data: { outer: "dashboard", inner: "live", profile: '`cacheLife("seconds")`' },
        },
      ],
    },
    {
      name: "a custom profile listed in shortProfiles",
      options: [{ shortProfiles: ["live"] }],
      code: `
import { cacheLife } from "next/cache";
async function ticker() { "use cache"; cacheLife('live'); return 1; }
export async function dashboard() { "use cache"; return ticker(); }`,
      errors: [
        {
          messageId: "shortExpire",
          suggestions: [
            {
              messageId: "addCacheLifeShort",
              output: `
import { cacheLife } from "next/cache";
async function ticker() { "use cache"; cacheLife('live'); return 1; }
export async function dashboard() { "use cache"; cacheLife('live'); return ticker(); }`,
            },
            {
              messageId: "addCacheLifeMinutes",
              output: `
import { cacheLife } from "next/cache";
async function ticker() { "use cache"; cacheLife('live'); return 1; }
export async function dashboard() { "use cache"; cacheLife('minutes'); return ticker(); }`,
            },
          ],
        },
      ],
    },
    {
      name: "shortProfiles from shared settings and a file-level outer function",
      settings: { "cache-components": { shortProfiles: ["realtime"] } },
      code: `
"use cache";
import { cacheLife as life } from "next/cache";
async function ticker() { "use cache"; life("realtime"); return 1; }
export async function getDashboard() {
  return ticker();
}`,
      errors: [
        {
          messageId: "shortExpire",
          line: 5,
          suggestions: [
            {
              messageId: "addCacheLifeShort",
              output: `
"use cache";
import { cacheLife as life } from "next/cache";
async function ticker() { "use cache"; life("realtime"); return 1; }
export async function getDashboard() {
  life("realtime");
  return ticker();
}`,
            },
            {
              messageId: "addCacheLifeMinutes",
              output: `
"use cache";
import { cacheLife as life } from "next/cache";
async function ticker() { "use cache"; life("realtime"); return 1; }
export async function getDashboard() {
  life("minutes");
  return ticker();
}`,
            },
          ],
        },
      ],
    },
    {
      name: "the inner function gets its short life from a helper",
      code: `
import { cacheLife } from "next/cache";
function realtime() { cacheLife("seconds"); }
async function ticker() { "use cache"; realtime(); return 1; }
export const dashboard = async () => { "use cache: remote"; return ticker(); };`,
      errors: [
        {
          messageId: "shortExpire",
          data: { outer: "dashboard", inner: "ticker", profile: '`cacheLife("seconds")`' },
        },
      ],
    },
    {
      name: "revalidate: 0 takes priority over a short expire",
      code: `
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ revalidate: 0, expire: 60 }); return 1; }
export async function dashboard() { "use cache"; return live(); }`,
      errors: [{ messageId: "zeroRevalidate", data: { outer: "dashboard", inner: "live" } }],
    },
  ],
});
