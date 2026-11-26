import { describe, expect, it } from "vitest";

import { closestProfile, noLegacySegmentConfig } from "../../src/rules/no-legacy-segment-config.ts";
import { createTester } from "../helpers/tester.ts";

const ENABLED = [{ cacheComponents: true }];
const PAGE = "app/blog/page.tsx";
const URL = "https://nextjs.org/docs/app/guides/migrating-to-cache-components";

function message(name: string, hint: string): string {
  return `\`export const ${name}\` isn't supported with Cache Components: Next.js fails the build with "Route segment config \\"${name}\\" is not compatible with \`nextConfig.cacheComponents\`". ${hint} See ${URL}`;
}

describe("closestProfile", () => {
  it.each([
    [1, "seconds"],
    [60, "minutes"],
    [300, "minutes"],
    [3600, "hours"],
    [86_400, "days"],
    [604_800, "weeks"],
    [31_536_000, "max"],
  ])("maps revalidate %i to %s", (seconds, profile) => {
    expect(closestProfile(seconds)).toBe(profile);
  });
});

createTester().run("cache-components/no-legacy-segment-config", noLegacySegmentConfig, {
  valid: [
    {
      name: "does nothing without the cacheComponents option",
      filename: PAGE,
      code: `export const revalidate = 60;\nexport default function Page() { return <main />; }`,
    },
    {
      name: "an export in a file outside the app directory",
      filename: "lib/config.ts",
      options: ENABLED,
      code: `export const revalidate = 60;`,
    },
    {
      name: "exports that Cache Components accepts",
      filename: PAGE,
      options: ENABLED,
      code: `export const metadata = { title: "Blog" };\nexport const dynamicParams = true;\nexport default function Page() { return <main />; }`,
    },
  ],
  invalid: [
    {
      name: "revalidate in a page",
      filename: PAGE,
      options: ENABLED,
      code: `export const revalidate = 60;\nexport default function Page() { return <main />; }`,
      errors: [
        {
          message: message(
            "revalidate",
            'Remove it, and add "use cache" with `cacheLife("minutes")`.',
          ),
          suggestions: [
            {
              messageId: "removeExport",
              data: { name: "revalidate" },
              output: `export default function Page() { return <main />; }`,
            },
          ],
        },
      ],
    },
    {
      name: "revalidate 0 and false",
      filename: "app/layout.tsx",
      options: ENABLED,
      code: `export const revalidate = 0;`,
      errors: [
        {
          messageId: "legacyConfig",
          data: {
            name: "revalidate",
            hint: "Remove it. Routes are dynamic by default with Cache Components.",
          },
        },
      ],
    },
    {
      name: "revalidate false",
      filename: "app/template.tsx",
      options: ENABLED,
      code: `export const revalidate = false;`,
      errors: [
        {
          messageId: "legacyConfig",
          data: {
            name: "revalidate",
            hint: 'Remove it, and add "use cache" with `cacheLife("max")`.',
          },
        },
      ],
    },
    {
      name: "each dynamic value",
      filename: PAGE,
      options: ENABLED,
      code: `export const dynamic = "force-static";`,
      errors: [
        {
          messageId: "legacyConfig",
          data: {
            name: "dynamic",
            hint: 'Remove it, and add "use cache" to the page or layout that should be cached.',
          },
        },
      ],
    },
    {
      name: "dynamic error",
      filename: PAGE,
      options: ENABLED,
      code: `export const dynamic = "error";`,
      errors: [
        {
          messageId: "legacyConfig",
          data: {
            name: "dynamic",
            hint: 'Remove it, and export `ensureStatic = "navigation"` (Next.js 16.4 or later) to fail the build when the route reads uncached or runtime data.',
          },
        },
      ],
    },
    {
      name: "fetchCache, runtime, and experimental_ppr in a route handler",
      filename: "app/api/route.ts",
      options: ENABLED,
      code: `export const fetchCache = "force-cache";\nexport const runtime = "nodejs";\nexport const experimental_ppr = true;\nexport async function GET() { return Response.json({}); }`,
      errors: [
        {
          messageId: "legacyConfig",
          data: {
            name: "fetchCache",
            hint: 'Remove it. `fetch` is not cached by default, and "use cache" caches the data you choose.',
          },
        },
        {
          messageId: "legacyConfig",
          data: {
            name: "runtime",
            hint: "Remove it. Cache Components requires the Node.js runtime, even when the value is `nodejs`.",
          },
        },
        {
          messageId: "legacyConfig",
          data: {
            name: "experimental_ppr",
            hint: "Remove it. Cache Components replaces this option.",
          },
        },
      ],
    },
    {
      name: "a re-exported local constant has no suggestion",
      filename: PAGE,
      options: ENABLED,
      code: `const revalidate = 3600;\nexport { revalidate };`,
      errors: [
        {
          messageId: "legacyConfig",
          data: {
            name: "revalidate",
            hint: 'Remove it, and add "use cache" with `cacheLife("hours")`.',
          },
          suggestions: [],
        },
      ],
    },
    {
      name: "a file without next.js imports",
      filename: "src/app/default.tsx",
      options: ENABLED,
      code: `export const dynamic = "force-dynamic";\nexport default function Default() { return null; }`,
      errors: [{ messageId: "legacyConfig" }],
    },
  ],
});
