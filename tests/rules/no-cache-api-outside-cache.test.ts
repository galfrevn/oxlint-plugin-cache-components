import { noCacheApiOutsideCache } from "../../src/rules/no-cache-api-outside-cache.ts";
import { createTester } from "../helpers/tester.ts";

const TAG_URL = "https://nextjs.org/docs/messages/cache-tag-outside-use-cache";
const LIFE_URL = "https://nextjs.org/docs/messages/cache-life-outside-use-cache";

createTester().run("cache-components/no-cache-api-outside-cache", noCacheApiOutsideCache, {
  valid: [
    {
      name: "inside use cache",
      code: `
import { cacheLife, cacheTag } from "next/cache";
export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts");
  return db.posts.findMany();
}`,
    },
    {
      name: "inside use cache: private and use cache: remote",
      code: `
import { cacheLife, cacheTag } from "next/cache";
export async function getCart() {
  "use cache: private";
  cacheLife("minutes");
}
export async function getCatalog() {
  "use cache: remote";
  cacheTag("catalog");
}`,
    },
    {
      name: "exported helper that a cached function in another file may call",
      code: `
import { cacheTag } from "next/cache";
export function tagPost(id: string) { cacheTag(\`post-\${id}\`); }`,
    },
    {
      name: "file-level use cache",
      code: `
"use cache";
import { cacheLife } from "next/cache";
export async function getMenu() { cacheLife("days"); return fetchMenu(); }`,
    },
    {
      name: "conditional calls inside a cached function",
      code: `
import { cacheLife } from "next/cache";
export async function getPost(id: string) {
  "use cache";
  if (id === "live") cacheLife("seconds");
  else cacheLife("days");
}`,
    },
    {
      name: "a helper called from a cached function",
      code: `
import { cacheTag } from "next/cache";
function tagAll(ids: string[]) { for (const id of ids) cacheTag(id); }
export async function getPosts() {
  "use cache";
  tagAll(["a", "b"]);
}`,
    },
    {
      name: "a helper with one cached caller and one uncached caller",
      filename: "app/page.tsx",
      code: `
import { cacheTag } from "next/cache";
function tagPosts() { cacheTag("posts"); }
async function getPosts() {
  "use cache";
  tagPosts();
}
export default async function Page() {
  tagPosts();
  return <List posts={await getPosts()} />;
}`,
    },
    {
      name: "a component outside a segment file may render inside a cached parent",
      filename: "components/post.tsx",
      code: `
import { cacheTag } from "next/cache";
function PostCard({ id }: { id: string }) {
  cacheTag(\`post-\${id}\`);
  return <article />;
}
async function Feed() {
  return <PostCard id="1" />;
}`,
    },
    {
      name: "a non-exported helper without callers",
      code: `
import { cacheTag } from "next/cache";
async function unused() { cacheTag("x"); }`,
    },
    {
      name: "a cacheTag function from another module",
      code: `
import { cacheTag } from "./tags";
cacheTag("posts");`,
    },
  ],
  invalid: [
    {
      name: "cacheLife at module scope",
      code: `
import { cacheLife } from "next/cache";
cacheLife("hours");`,
      errors: [
        {
          message: `\`cacheLife()\` can't be called at module scope. Call it inside a "use cache" function. See ${LIFE_URL}`,
        },
      ],
    },
    {
      name: "cacheTag inside a file-level server action",
      code: `
"use server";
import { cacheTag, updateTag } from "next/cache";
export async function savePost(id: string) {
  cacheTag(\`post-\${id}\`);
  updateTag(\`post-\${id}\`);
}`,
      errors: [
        {
          message: `\`cacheTag()\` can only be called inside a "use cache" or "use cache: private" function. Add the directive to the function that should be cached, or move this call into one. See ${TAG_URL}`,
          suggestions: [],
        },
      ],
    },
    {
      name: "cacheTag inside an inline server action",
      filename: "app/page.tsx",
      code: `
import { cacheTag } from "next/cache";
export default function Page() {
  async function save() {
    "use server";
    cacheTag("posts");
  }
  return <form action={save} />;
}`,
      errors: [{ messageId: "outside", data: { api: "cacheTag", url: TAG_URL }, suggestions: [] }],
    },
    {
      name: "cacheLife inside a route handler",
      filename: "app/api/posts/route.ts",
      code: `
import { cacheLife } from "next/cache";
export async function GET() {
  cacheLife("minutes");
  return Response.json(await getPosts());
}`,
      errors: [
        { messageId: "outside", data: { api: "cacheLife", url: LIFE_URL }, suggestions: [] },
      ],
    },
    {
      name: "cacheTag inside a callback of a route handler",
      filename: "app/api/posts/route.ts",
      code: `
import { cacheTag } from "next/cache";
export async function GET() {
  ["a"].forEach((tag) => cacheTag(tag));
  return Response.json({});
}`,
      errors: [{ messageId: "outside" }],
    },
    {
      name: "cacheTag inside a client component",
      filename: "components/button.tsx",
      code: `
"use client";
import { cacheTag } from "next/cache";
export function Button() {
  cacheTag("button");
  return <button />;
}`,
      errors: [{ messageId: "outside" }],
    },
    {
      name: "cacheLife inside generateStaticParams",
      filename: "app/blog/[slug]/page.tsx",
      code: `
import { cacheLife } from "next/cache";
export async function generateStaticParams() {
  cacheLife("days");
  return [];
}`,
      errors: [{ messageId: "outside", suggestions: [] }],
    },
    {
      name: "cacheTag inside an unstable_cache callback",
      code: `
import { cacheTag, unstable_cache } from "next/cache";
export const getPosts = unstable_cache(async () => {
  cacheTag("posts");
  return db.posts.findMany();
}, ["posts"]);`,
      errors: [
        {
          message: `\`cacheTag()\` doesn't work inside \`unstable_cache()\`. Use the \`tags\` or \`revalidate\` options of \`unstable_cache\`, or switch this function to "use cache". See ${TAG_URL}`,
        },
      ],
    },
    {
      name: "a helper called only from an unstable_cache callback",
      code: `
import { cacheLife, unstable_cache } from "next/cache";
function setLife() { cacheLife("hours"); }
export const getPosts = unstable_cache(async () => { setLife(); return []; });`,
      errors: [{ messageId: "unstableCache", data: { api: "cacheLife", url: LIFE_URL } }],
    },
    {
      name: "a non-exported helper whose only caller is a page",
      filename: "app/posts/page.tsx",
      code: `
import { cacheTag } from "next/cache";
async function loadPosts() { cacheTag("posts"); return db.posts.findMany(); }
export default async function Page() {
  const posts = await loadPosts();
  return <List posts={posts} />;
}`,
      errors: [
        {
          messageId: "outside",
          data: { api: "cacheTag", url: TAG_URL },
          suggestions: [
            {
              messageId: "addUseCache",
              data: { fn: "loadPosts" },
              output: `
import { cacheTag } from "next/cache";
async function loadPosts() { "use cache"; cacheTag("posts"); return db.posts.findMany(); }
export default async function Page() {
  const posts = await loadPosts();
  return <List posts={posts} />;
}`,
            },
          ],
        },
      ],
    },
    {
      name: "a page that calls cacheTag directly",
      filename: "app/posts/page.tsx",
      code: `
import { cacheTag } from "next/cache";
export default async function Page() {
  cacheTag("posts");
  return <List />;
}`,
      errors: [
        {
          messageId: "outside",
          suggestions: [
            {
              messageId: "addUseCache",
              data: { fn: "Page" },
              output: `
import { cacheTag } from "next/cache";
export default async function Page() {
  "use cache";
  cacheTag("posts");
  return <List />;
}`,
            },
          ],
        },
      ],
    },
    {
      name: "a non-exported helper called from a server action and a route handler",
      filename: "app/api/route.ts",
      code: `
import { cacheTag } from "next/cache";
function tag() { cacheTag("x"); }
export async function POST() { tag(); return Response.json({}); }
export async function PUT() { tag(); return Response.json({}); }`,
      errors: [{ messageId: "outside", suggestions: [] }],
    },
  ],
});
