import { validInvalidationContext } from "../../src/rules/valid-invalidation-context.ts";
import { createTester } from "../helpers/tester.ts";

const REVALIDATE_URL = "https://nextjs.org/docs/messages/revalidate-in-use-cache";

createTester().run("cache-components/valid-invalidation-context", validInvalidationContext, {
  valid: [
    {
      name: "every API inside a file-level server action",
      filename: "app/actions.ts",
      code: `
"use server";
import { refresh, revalidatePath, revalidateTag, updateTag } from "next/cache";
export async function createPost(data: FormData) {
  await db.posts.create(parse(data));
  updateTag("posts");
  revalidateTag("feed", "max");
  revalidatePath("/");
  refresh();
}`,
    },
    {
      name: "revalidateTag in a route handler",
      filename: "app/api/revalidate/route.ts",
      code: `
import { revalidatePath, revalidateTag } from "next/cache";
export async function POST(req: Request) {
  if (req.headers.get("x-secret") !== process.env.REVALIDATE_SECRET) return new Response(null, { status: 401 });
  revalidateTag("posts", "max");
  revalidatePath("/blog");
  return Response.json({ ok: true });
}`,
    },
    {
      name: "an inline server action inside a server component",
      filename: "app/page.tsx",
      code: `
import { updateTag } from "next/cache";
export default function Page() {
  async function save() {
    "use server";
    updateTag("posts");
  }
  return <form action={save} />;
}`,
    },
    {
      name: "an exported helper without callers in the file",
      code: `
import { revalidateTag } from "next/cache";
export async function invalidatePosts() { revalidateTag("posts", "max"); }`,
    },
    {
      name: "revalidateTag in generateMetadata is not reported",
      filename: "app/blog/page.tsx",
      code: `
import { revalidateTag } from "next/cache";
export async function generateMetadata() {
  revalidateTag("meta", "max");
  return {};
}`,
    },
    {
      name: "an after callback is treated as unknown",
      filename: "app/page.tsx",
      code: `
import { after } from "next/server";
import { revalidateTag } from "next/cache";
export default async function Page() {
  after(() => revalidateTag("views", "max"));
  return <main />;
}`,
    },
    {
      name: "a route.ts file outside the app directory",
      filename: "lib/route.ts",
      code: `
import { updateTag } from "next/cache";
export async function POST() { updateTag("posts"); }`,
    },
    {
      name: "a helper called from a server action and a route handler",
      filename: "app/api/route.ts",
      code: `
import { revalidateTag } from "next/cache";
async function purge() { revalidateTag("posts", "max"); }
export async function POST() { await purge(); return Response.json({}); }`,
    },
  ],
  invalid: [
    {
      name: "updateTag in a route handler",
      filename: "app/api/posts/route.ts",
      code: `
import { updateTag } from "next/cache";
export async function POST(req: Request) {
  await savePost(await req.json());
  updateTag("posts");
  return Response.json({ ok: true });
}`,
      errors: [
        {
          message:
            "`updateTag()` can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use `revalidateTag()` instead. See https://nextjs.org/docs/app/api-reference/functions/updateTag",
          suggestions: [
            {
              messageId: "useRevalidateTag",
              output: `
import { updateTag, revalidateTag } from "next/cache";
export async function POST(req: Request) {
  await savePost(await req.json());
  revalidateTag("posts", { expire: 0 });
  return Response.json({ ok: true });
}`,
            },
          ],
        },
      ],
    },
    {
      name: "updateTag in a route handler with revalidateTag already imported",
      filename: "src/app/api/posts/route.js",
      code: `
import { revalidateTag as rt, updateTag } from "next/cache";
export async function POST() {
  updateTag(\`post-\${1}\`);
}`,
      errors: [
        {
          messageId: "updateTagOutsideAction",
          suggestions: [
            {
              messageId: "useRevalidateTag",
              output: `
import { revalidateTag as rt, updateTag } from "next/cache";
export async function POST() {
  rt(\`post-\${1}\`, { expire: 0 });
}`,
            },
          ],
        },
      ],
    },
    {
      name: "updateTag through a namespace import in a route handler",
      filename: "app/api/route.ts",
      code: `
import * as cache from "next/cache";
export const POST = async () => {
  cache.updateTag("posts");
};`,
      errors: [
        {
          messageId: "updateTagOutsideAction",
          suggestions: [
            {
              messageId: "useRevalidateTag",
              output: `
import * as cache from "next/cache";
export const POST = async () => {
  cache.revalidateTag("posts", { expire: 0 });
};`,
            },
          ],
        },
      ],
    },
    {
      name: "the suggestion extends the existing next/cache import",
      filename: "app/api/route.ts",
      code: `
import { refresh } from "./refresh";
import { updateTag } from "next/cache";
export async function DELETE() { updateTag("posts"); }`,
      errors: [
        {
          messageId: "updateTagOutsideAction",
          suggestions: [
            {
              messageId: "useRevalidateTag",
              output: `
import { refresh } from "./refresh";
import { updateTag, revalidateTag } from "next/cache";
export async function DELETE() { revalidateTag("posts", { expire: 0 }); }`,
            },
          ],
        },
      ],
    },
    {
      name: "refresh in a route handler",
      filename: "app/api/route.ts",
      code: `
import { refresh } from "next/cache";
export async function POST() { refresh(); }`,
      errors: [
        {
          message:
            "`refresh()` can only be called from within a Server Action. In Client Components, use `router.refresh()`. See https://nextjs.org/docs/app/api-reference/functions/refresh",
          suggestions: [],
        },
      ],
    },
    {
      name: "revalidatePath during render",
      filename: "app/page.tsx",
      code: `
import { revalidatePath } from "next/cache";
export default async function Page() {
  revalidatePath("/");
  return <Home />;
}`,
      errors: [
        {
          message: `\`revalidatePath()\` can't be called during render (\`Page\` is a Server Component). Call it from a Server Action or Route Handler instead. See ${REVALIDATE_URL}`,
        },
      ],
    },
    {
      name: "updateTag in a server component outside a segment file",
      filename: "components/feed.tsx",
      code: `
import { updateTag } from "next/cache";
function Feed() {
  updateTag("feed");
  return <ul />;
}`,
      errors: [{ messageId: "duringRender", data: { api: "updateTag", fn: "Feed" } }],
    },
    {
      name: "revalidateTag inside a cached function",
      code: `
import { revalidateTag } from "next/cache";
export async function getPosts() {
  "use cache";
  revalidateTag("posts", "max");
}`,
      errors: [
        {
          message: `\`revalidateTag()\` can't be called inside a cached function ("use cache" \`getPosts\`). Call it from a Server Action or Route Handler instead. See ${REVALIDATE_URL}`,
        },
      ],
    },
    {
      name: "updateTag inside a private cache",
      code: `
import { updateTag } from "next/cache";
export async function getCart() {
  "use cache: private";
  updateTag("cart");
}`,
      errors: [
        {
          messageId: "inCachedFunction",
          data: { api: "updateTag", scope: '"use cache: private"', fn: "getCart" },
        },
      ],
    },
    {
      name: "refresh inside an unstable_cache callback",
      code: `
import { refresh, unstable_cache } from "next/cache";
export const getFeed = unstable_cache(async () => { refresh(); return []; });`,
      errors: [
        {
          messageId: "inCachedFunction",
          data: { api: "refresh", scope: "`unstable_cache()`", fn: "getFeed" },
        },
      ],
    },
    {
      name: "revalidatePath inside a file-level cached export",
      code: `
"use cache";
import { revalidatePath } from "next/cache";
export async function getMenu() { revalidatePath("/menu"); }`,
      errors: [
        {
          messageId: "inCachedFunction",
          data: { api: "revalidatePath", scope: '"use cache"', fn: "getMenu" },
        },
      ],
    },
    {
      name: "revalidatePath inside generateStaticParams",
      filename: "app/blog/[slug]/page.tsx",
      code: `
import { revalidatePath } from "next/cache";
export async function generateStaticParams() {
  revalidatePath("/blog");
  return [];
}`,
      errors: [
        {
          message: `\`revalidatePath()\` can't be called inside \`generateStaticParams\`. Call it from a Server Action or Route Handler instead. See ${REVALIDATE_URL}`,
        },
      ],
    },
    {
      name: "updateTag and refresh inside generateMetadata",
      filename: "app/blog/page.tsx",
      code: `
import { refresh, updateTag } from "next/cache";
export async function generateMetadata() {
  updateTag("meta");
  refresh();
  return {};
}`,
      errors: [
        { messageId: "updateTagOutsideAction", suggestions: [] },
        { messageId: "refreshOutsideAction" },
      ],
    },
    {
      name: "revalidateTag in proxy.ts",
      filename: "proxy.ts",
      code: `
import { revalidateTag } from "next/cache";
export function proxy() { revalidateTag("posts", "max"); }`,
      errors: [
        {
          message:
            "`revalidateTag()` only works in Server Actions and Route Handlers, not in Proxy. See https://nextjs.org/docs/app/api-reference/functions/revalidateTag",
        },
      ],
    },
    {
      name: "updateTag in src/middleware.ts",
      filename: "src/middleware.ts",
      code: `
import { updateTag } from "next/cache";
export function middleware() { updateTag("posts"); }`,
      errors: [{ messageId: "updateTagOutsideAction", suggestions: [] }],
    },
    {
      name: "revalidatePath in a client component",
      filename: "components/button.tsx",
      code: `
"use client";
import { revalidatePath, refresh } from "next/cache";
export function Button() {
  return <button onClick={() => { revalidatePath("/"); refresh(); }} />;
}`,
      errors: [
        {
          messageId: "inProxyOrClient",
          data: { api: "revalidatePath", where: "Client Components" },
        },
        { messageId: "refreshOutsideAction" },
      ],
    },
    {
      name: "a helper shared by a server action and a component",
      filename: "app/page.tsx",
      code: `
import { updateTag } from "next/cache";
async function invalidate() { updateTag("posts"); }
export default async function Page() {
  await invalidate();
  async function save() {
    "use server";
    await invalidate();
  }
  return <form action={save} />;
}`,
      errors: [{ messageId: "duringRender", data: { api: "updateTag", fn: "Page" } }],
    },
    {
      name: "cached context takes priority over render",
      filename: "app/page.tsx",
      code: `
import { revalidateTag } from "next/cache";
function purge() { revalidateTag("posts", "max"); }
async function getPosts() { "use cache"; purge(); return []; }
export default async function Page() { purge(); return <List posts={await getPosts()} />; }`,
      errors: [
        {
          messageId: "inCachedFunction",
          data: { api: "revalidateTag", scope: '"use cache"', fn: "getPosts" },
        },
      ],
    },
  ],
});
