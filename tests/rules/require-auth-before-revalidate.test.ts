import { requireAuthBeforeRevalidate } from "../../src/rules/require-auth-before-revalidate.ts";
import { createTester } from "../helpers/tester.ts";

const ACTIONS = "app/actions.ts";
const ROUTE = "app/api/revalidate/route.ts";

createTester().run("cache-components/require-auth-before-revalidate", requireAuthBeforeRevalidate, {
  valid: [
    {
      name: "an action that checks the session first",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function deletePost(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  await db.posts.delete({ where: { id, authorId: session.user.id } });
  updateTag("posts");
}`,
    },
    {
      name: "a route handler that compares a header with a secret",
      filename: ROUTE,
      code: `
import { revalidateTag } from "next/cache";
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== \`Bearer \${process.env.REVALIDATE_TOKEN}\`) return new Response(null, { status: 401 });
  revalidateTag("posts", "max");
}`,
    },
    {
      name: "a route handler that checks process.env.REVALIDATE_SECRET",
      filename: ROUTE,
      code: `
import { revalidatePath } from "next/cache";
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ message: "Invalid secret" }, { status: 401 });
  }
  revalidatePath("/");
  return Response.json({ revalidated: true });
}`,
    },
    {
      name: "a route handler that verifies a webhook signature",
      filename: ROUTE,
      code: `
import { revalidateTag } from "next/cache";
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, process.env.SANITY_WEBHOOK_SECRET)) return new Response(null, { status: 401 });
  revalidateTag("posts", "max");
}`,
    },
    {
      name: "an action wrapped with withAuth",
      filename: ACTIONS,
      code: `
"use server";
import { revalidateTag } from "next/cache";
export const save = withAuth(async () => {
  revalidateTag("posts", "max");
});`,
    },
    {
      name: "a next-safe-action client from authWrappers",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export const save = authActionClient.inputSchema(schema).action(async ({ parsedInput }) => {
  updateTag("posts");
});`,
    },
    {
      name: "an action listed in allowPublic",
      filename: ACTIONS,
      options: [{ allowPublic: ["subscribe"] }],
      code: `
"use server";
import { revalidateTag } from "next/cache";
export async function subscribe(email: string) {
  await db.subscribers.create({ email });
  revalidateTag("subscriber-count", "max");
}`,
    },
    {
      name: "refresh is not checked",
      filename: ACTIONS,
      code: `
"use server";
import { refresh } from "next/cache";
export async function reload() { refresh(); }`,
    },
    {
      name: "a custom auth helper from authFunctions",
      filename: ACTIONS,
      options: [{ authFunctions: ["assertAdmin"] }],
      code: `
"use server";
import { updateTag } from "next/cache";
export async function publish() {
  await assertAdmin();
  updateTag("posts");
}`,
    },
    {
      name: "a member auth call such as supabase.auth.getUser",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function publish() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) return;
  updateTag("posts");
}`,
    },
    {
      name: "auth checked in an enclosing if statement",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function publish() {
  if (await requireUser()) {
    updateTag("posts");
  }
}`,
    },
    {
      name: "auth functions from shared settings",
      filename: ACTIONS,
      settings: { "cache-components": { authFunctions: ["ensureSignedIn"] } },
      code: `
"use server";
import { updateTag } from "next/cache";
export async function publish() {
  await ensureSignedIn();
  updateTag("posts");
}`,
    },
    {
      name: "a helper that is not an action or route handler",
      code: `
import { updateTag } from "next/cache";
export async function purge() { updateTag("posts"); }`,
    },
  ],
  invalid: [
    {
      name: "an action without auth",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function deletePost(id: string) {
  await db.posts.delete({ where: { id } });
  updateTag("posts");
}`,
      errors: [
        {
          message:
            "This Server Action calls `updateTag()` without an auth check. Server Actions are reachable by direct requests, so anyone could invalidate this cache. Verify the user (or a secret) before invalidating, or list your auth helper in `authFunctions`. See https://nextjs.org/docs/app/guides/data-security",
          line: 6,
        },
      ],
    },
    {
      name: "auth after the invalidation",
      filename: ACTIONS,
      code: `
"use server";
import { revalidateTag } from "next/cache";
export async function save() {
  revalidateTag("posts", "max");
  await auth();
}`,
      errors: [
        {
          messageId: "missingAuth",
          data: { api: "revalidateTag", context: "Server Action", contextNoun: "Server Actions" },
        },
      ],
    },
    {
      name: "auth in a branch that does not dominate the call",
      filename: ACTIONS,
      code: `
"use server";
import { revalidateTag } from "next/cache";
export async function save(strict: boolean) {
  if (strict) {
    await auth();
  }
  revalidateTag("posts", "max");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "a route handler that revalidates any path",
      filename: ROUTE,
      code: `
import { revalidatePath } from "next/cache";
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (path) revalidatePath(path);
  return Response.json({ revalidated: true });
}`,
      errors: [
        {
          message:
            "This Route Handler calls `revalidatePath()` without an auth check. Route Handlers are reachable by direct requests, so anyone could invalidate this cache. Verify the user (or a secret) before invalidating, or list your auth helper in `authFunctions`. See https://nextjs.org/docs/app/guides/data-security",
        },
      ],
    },
    {
      name: "an inline server action inside a component",
      filename: "app/page.tsx",
      code: `
import { updateTag } from "next/cache";
export default function Page() {
  async function like() {
    "use server";
    updateTag("likes");
  }
  return <form action={like} />;
}`,
      errors: [
        {
          messageId: "missingAuth",
          data: { api: "updateTag", context: "Server Action", contextNoun: "Server Actions" },
        },
      ],
    },
    {
      name: "one report per function",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
export async function save() {
  revalidateTag("posts", "max");
  revalidatePath("/");
}`,
      errors: [
        {
          messageId: "missingAuth",
          data: { api: "revalidateTag", context: "Server Action", contextNoun: "Server Actions" },
        },
      ],
    },
    {
      name: "a secret check is not enough in a server action",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save(token: string) {
  if (token !== process.env.SECRET) return;
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "a wrapper that is not an auth wrapper",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export const save = withLogging(async () => {
  updateTag("posts");
});`,
      errors: [{ messageId: "missingAuth" }],
    },
  ],
});
