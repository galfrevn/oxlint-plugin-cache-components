import { requireAuthBeforeRevalidate } from "../../src/rules/require-auth-before-revalidate.ts";
import { createTester } from "../helpers/tester.ts";

const ACTIONS = "app/actions.ts";
const ROUTE = "app/api/revalidate/route.ts";
const FORM_FIELDS = Array.from(
  { length: 64 },
  (_, index) => `    field${index}: formData.get("field${index}")?.toString() ?? "",`,
).join("\n");
const UNCHECKED_SETTINGS_ACTION = `
"use server";
import { revalidatePath } from "next/cache";
export async function saveSettings(formData: FormData) {
  const settings = {
${FORM_FIELDS}
  };
  await db.settings.update({ data: settings });
  revalidatePath("/settings");
}`;

createTester().run("cache-components/require-auth-before-revalidate", requireAuthBeforeRevalidate, {
  valid: [
    {
      name: "an action that checks the session before 64 optional form fields",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath } from "next/cache";
export async function saveSettings(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const settings = {
${FORM_FIELDS}
  };
  await db.settings.update({ data: settings });
  revalidatePath("/settings");
}`,
    },
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
      name: "several invalidations after one auth check",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath, updateTag } from "next/cache";
export async function publishPost(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  await db.posts.publish({ where: { id, authorId: session.user.id } });
  updateTag("posts");
  updateTag(\`post-\${id}\`);
  revalidatePath("/blog");
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
    {
      name: "an auth-like helper name such as requireCronAuth",
      filename: ROUTE,
      code: `
import { revalidateTag } from "next/cache";
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  revalidateTag("plugins", "max");
}`,
    },
    {
      name: "a helper imported from an auth module",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
export async function removeBot(id: string) {
  const viewer = await getViewer();
  if (!viewer) return;
  revalidatePath("/my-bots");
}`,
    },
    {
      name: "a rate-limited public action",
      filename: ACTIONS,
      code: `
"use server";
import { revalidateTag } from "next/cache";
export async function trackInstall(slug: string) {
  const { success } = await ratelimit.limit(slug);
  if (!success) return;
  revalidateTag(\`plugin-\${slug}\`, "max");
}`,
    },
    {
      name: "a webhook verified with an HMAC header and a secret constant",
      filename: "app/api/webhooks/shopify/route.ts",
      code: `
import { revalidateTag } from "next/cache";
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
export async function POST(request: Request) {
  const body = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhook(body, hmac, SHOPIFY_WEBHOOK_SECRET)) return new Response(null, { status: 401 });
  revalidateTag("products", { expire: 0 });
}`,
    },
    {
      name: "an awaited data access helper may check auth",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath } from "next/cache";
import { deleteWorkspace } from "@/data/workspaces";
export async function deleteWorkspaceAction(slug: string) {
  const result = await deleteWorkspace(slug);
  if (result.error) return result;
  revalidatePath("/workspaces");
}`,
    },
    {
      name: "an awaited local helper may check auth",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
async function loadOwnedPost(id: string) { return db.posts.find(id); }
export async function publish(id: string) {
  await loadOwnedPost(id);
  updateTag("posts");
}`,
    },
    {
      name: "a procedure whose name indicates auth",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath } from "next/cache";
export const grantCourse = superAdminProcedure.input(schema).action(async ({ input }) => {
  revalidatePath("/admin/users");
});`,
    },
    {
      name: "a permission-based action client",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export const updateProject = permissionActionClient({ project: ["update"] })
  .inputSchema(schema)
  .action(async ({ parsedInput }) => {
    updateTag(\`project-\${parsedInput.id}\`);
  });`,
    },
    {
      name: "auth in both branches of an if statement",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save(admin: boolean) {
  if (admin) {
    await requireAuth();
  } else {
    await requireUser();
  }
  updateTag("posts");
}`,
    },
    {
      name: "auth in a try block whose catch clause returns",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save() {
  try {
    await requireUser();
  } catch {
    return { error: "Unauthorized" };
  }
  updateTag("posts");
}`,
    },
    {
      name: "an awaited Effect runner of an imported function",
      filename: ACTIONS,
      code: `
"use server";
import { revalidatePath } from "next/cache";
import { serverRuntime } from "#source/lib/runtime.ts";
import { unsubscribeWithToken } from "#source/lib/unsubscribe.ts";
export async function unsubscribe(token: string) {
  const outcome = await serverRuntime.runPromise(unsubscribeWithToken(token));
  if (outcome === "saved") revalidatePath("/preferences/[token]", "page");
}`,
    },
    {
      name: "an awaited Effect.runPromiseExit of a local function",
      filename: ACTIONS,
      code: `
"use server";
import { Effect } from "effect";
import { updateTag } from "next/cache";
const archiveJob = (id: string) => Effect.succeed(id);
export async function archive(id: string) {
  await Effect.runPromiseExit(archiveJob(id));
  updateTag("jobs");
}`,
    },
    {
      name: "a public action that verifies its token",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { revalidatePath } from "next/cache";

export async function unsubscribe(token: string) {
  const subscriber = await verifyUnsubscribeToken(token);
  if (!subscriber) throw new Error("Invalid token");
  await db.subscribers.update({ where: { id: subscriber.id }, data: { subscribed: false } });
  revalidatePath("/preferences");
}`,
    },
    {
      name: "an auth check before a direct invalidation",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
import { requireSession } from "#source/lib/authentication/session.ts";
export async function direct() {
  await requireSession();
  updateTag("jobs");
}`,
    },
    {
      name: "an auth check before an invalidation in a promise callback",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
import { requireSession } from "#source/lib/authentication/session.ts";
export async function callback() {
  await requireSession();
  await Promise.resolve().then(() => updateTag("jobs"));
}`,
    },
    {
      name: "an auth check before an invalidation in nested Effect callbacks",
      filename: ACTIONS,
      code: `
"use server";
import { Effect } from "effect";
import { updateTag } from "next/cache";
import { requireSession } from "#source/lib/authentication/session.ts";
export async function effect() {
  await requireSession();
  await Effect.runPromise(
    Effect.succeed(1).pipe(Effect.tap(() => Effect.sync(() => updateTag("jobs")))),
  );
}`,
    },
    {
      name: "an auth check inside the callback before the invalidation",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function publishAll(ids: string[]) {
  await Promise.all(
    ids.map(async (id) => {
      await requireSession();
      updateTag(id);
    }),
  );
}`,
    },
  ],
  invalid: [
    {
      name: "an action with 64 optional form fields and no auth",
      filename: ACTIONS,
      code: UNCHECKED_SETTINGS_ACTION,
      errors: [
        {
          messageId: "missingAuth",
          line:
            UNCHECKED_SETTINGS_ACTION.split("\n").findIndex((line) =>
              line.includes('revalidatePath("'),
            ) + 1,
        },
      ],
    },
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
      name: "an awaited Effect runner of a client call",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
import { serverRuntime } from "#source/lib/runtime.ts";
export async function deletePost(id: string) {
  await serverRuntime.runPromise(db.posts.delete({ where: { id } }));
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth", line: 7 }],
    },
    {
      name: "an awaited Effect runner with trustAwaitedCalls off",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { revalidatePath } from "next/cache";
import { serverRuntime } from "#source/lib/runtime.ts";
import { unsubscribeWithToken } from "#source/lib/unsubscribe.ts";
export async function unsubscribe(token: string) {
  const outcome = await serverRuntime.runPromise(unsubscribeWithToken(token));
  if (outcome === "saved") revalidatePath("/preferences/[token]", "page");
}`,
      errors: [{ messageId: "missingAuth", line: 8 }],
    },
    {
      name: "an invalidation in a callback created before the auth check",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save() {
  const pending = Promise.resolve().then(() => updateTag("jobs"));
  await requireSession();
  await pending;
}`,
      errors: [{ messageId: "missingAuth", line: 5 }],
    },
    {
      name: "an invalidation in a callback after an auth check on one branch",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save(admin: boolean) {
  if (admin) await requireSession();
  await Promise.resolve().then(() => updateTag("jobs"));
}`,
      errors: [{ messageId: "missingAuth", line: 6 }],
    },
    {
      name: "an auth check between two invalidations",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
export async function publishPost(id: string) {
  updateTag("drafts");
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth", line: 5 }],
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
    {
      name: "an author lookup is not an auth check",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { updateTag } from "next/cache";
import { getAuthors } from "@/lib/authors";
export async function publish() {
  const author = await getAuthor();
  await getAuthors();
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "awaited member calls on an imported client are not auth checks",
      filename: ACTIONS,
      code: `
"use server";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
export async function deletePost(id: string) {
  await db.posts.delete({ where: { id } });
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "synchronous validation and global fetch are not auth checks",
      filename: ROUTE,
      code: `
import { revalidateTag } from "next/cache";
import { z } from "zod";
export async function POST(request: Request) {
  const { tag } = z.object({ tag: z.string() }).parse(await request.json());
  await fetch("https://example.com/hook");
  revalidateTag(tag, "max");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "awaited helpers are not trusted when trustAwaitedCalls is false",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { revalidatePath } from "next/cache";
import { deleteWorkspace } from "@/data/workspaces";
export async function deleteWorkspaceAction(slug: string) {
  await deleteWorkspace(slug);
  revalidatePath("/workspaces");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "auth inside a loop that may not run",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save(ids: string[]) {
  for (const id of ids) {
    await requireUser();
  }
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
    {
      name: "auth in a try block whose catch clause continues",
      filename: ACTIONS,
      options: [{ trustAwaitedCalls: false }],
      code: `
"use server";
import { updateTag } from "next/cache";
export async function save() {
  try {
    await requireUser();
  } catch {
    console.error("auth failed");
  }
  updateTag("posts");
}`,
      errors: [{ messageId: "missingAuth" }],
    },
  ],
});
