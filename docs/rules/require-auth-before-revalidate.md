# `cache-components/require-auth-before-revalidate`

Require an auth check before cache invalidation in Server Actions and Route Handlers.

**Preset:** `recommended` (warn), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

Every exported Server Action and every Route Handler is reachable by a direct request. The Next.js data security guide says to verify authentication and authorization inside each one. An action or endpoint that invalidates the cache without a check lets anyone purge it in a loop, which costs recomputation, function invocations, and origin bandwidth.

This rule is a heuristic, so it ships as `warn` in `recommended`. It is not a security control and does not prove that an endpoint is safe.

In a Server Action or a Route Handler, the rule reports the first `revalidateTag()`, `revalidatePath()`, or `updateTag()` call that has no auth check before it. A check counts when it runs on every path from the start of the function to the call, which the rule decides with oxlint's code path analysis. When the call is inside a callback, such as `.then(() => updateTag("posts"))` or `Effect.sync(() => updateTag("posts"))`, a check also counts when it runs on every path to the point where the callback is created. A check in only one branch, in a loop that may not run, or in a `try` block whose `catch` clause continues does not count:

- A call to a function listed in `authFunctions`. An entry such as `getUser` also matches member calls such as `supabase.auth.getUser()`. An entry such as `auth.api.getSession` matches the end of a member chain.
- A call to a function whose name contains `auth` (not `author`), `session`, `permission`, `signature`, `webhook`, `verif`, `guard`, or `protect`, such as `requireCronAuth()` or `verifyWebhook()`.
- A call to a function imported from a module whose path contains `auth` or `session`, or from `@clerk/`, such as `getViewer()` from `@/lib/auth`.
- A rate limit, such as `ratelimit.limit(ip)` or `checkRateLimit()`. A rate limit bounds abusive invalidation, which is the risk this rule targets.
- In Route Handlers only: an equality comparison with `process.env.<NAME>`, where the name contains `SECRET`, `TOKEN`, or `KEY`, or with a constant whose name contains `SECRET`; a call such as `verifySignature(body, process.env.WEBHOOK_SECRET)`; or a read of `headers.get("authorization")`, `headers.get("x-...-secret")`, or `headers.get("x-...-hmac-...")`.

The rule also stops at an awaited call to a function, imported or declared in the same file, that runs before the invalidation, such as `await deleteWorkspace(slug)`. Data access helpers often check auth inside, and the rule cannot see into another file. An awaited Effect runner, `runPromise` or `runPromiseExit`, counts the same way when its argument is a call to such a function, such as `await runtime.runPromise(deleteWorkspace(slug))`. Member calls on a client, such as `await db.posts.delete()`, do not count, directly or through a runner. Set `trustAwaitedCalls` to `false` to require a recognized check instead.

An action that is public on purpose, such as an unsubscribe link in an email, is often protected by a token instead of a session. Verify the token with a function whose name matches a pattern above, such as `verifyUnsubscribeToken(token)`, or list the action in `allowPublic` when anyone may call it.

The rule skips a function that is wrapped by an entry of `authWrappers`, or by a wrapper whose name contains `auth`, `admin`, `permission`, `protected`, `private`, `session`, or `secure`, such as `adminProcedure.input(schema).action(fn)`. It also skips a function whose name is listed in `allowPublic`. `refresh()` is not checked, because it does not invalidate server-cached data.

## Examples

Invalid:

```ts
"use server";
import { updateTag } from "next/cache";

export async function deletePost(id: string) {
  await db.posts.delete({ where: { id } });
  updateTag("posts");
}
```

```ts
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (path) revalidatePath(path);
  return Response.json({ revalidated: true });
}
```

Valid:

```ts
"use server";
import { updateTag } from "next/cache";

export async function deletePost(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  await db.posts.delete({ where: { id, authorId: session.user.id } });
  updateTag("posts");
}
```

```ts
"use server";
import { revalidatePath } from "next/cache";

export async function unsubscribe(token: string) {
  const subscriber = await verifyUnsubscribeToken(token);
  if (!subscriber) throw new Error("Invalid token");
  await db.subscribers.update({ where: { id: subscriber.id }, data: { subscribed: false } });
  revalidatePath("/preferences");
}
```

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.REVALIDATE_TOKEN}`) {
    return new Response(null, { status: 401 });
  }
  revalidateTag("posts", "max");
}
```

## Options

```json
{
  "cache-components/require-auth-before-revalidate": [
    "warn",
    {
      "authFunctions": ["assertAdmin"],
      "authWrappers": ["adminAction"],
      "allowPublic": ["subscribe"],
      "trustAwaitedCalls": true
    }
  ]
}
```

- `authFunctions` (`string[]`): functions whose call counts as an auth check. Entries are added to the defaults: `auth`, `checkAuth`, `currentUser`, `getAuth`, `getCurrentUser`, `getServerSession`, `getSession`, `getUser`, `requireAuth`, `requireSession`, `requireUser`, `validateRequest`, and `verifySession`.
- `authWrappers` (`string[]`): higher-order functions that wrap the action with auth. Entries are added to the defaults: `withAuth`, `authActionClient.action`, `protectedAction`, and `authenticatedAction`. A dotted entry such as `authActionClient.action` also matches `authActionClient.inputSchema(schema).action(fn)`.
- `allowPublic` (`string[]`, default `[]`): names of actions or handlers that are public on purpose, such as a newsletter form.
- `trustAwaitedCalls` (`boolean`, default `true`): treat an awaited call to an imported or local function before the invalidation as a possible auth check, directly or through `runPromise` or `runPromiseExit`.
- `appDir` (`string[]`, default `["app", "src/app"]`): App Router directories, used to recognize `route` files.

`authFunctions`, `authWrappers`, and `appDir` can also be set once in `settings["cache-components"]`.

## Limitations

- Auth enforced only in `proxy.ts` or `middleware.ts` is not visible to the rule. The Next.js docs advise against relying only on it.
- Helpers that invalidate the cache are not checked. Only the Server Action or Route Handler itself is.

## Related

- Next.js: [Data security](https://nextjs.org/docs/app/guides/data-security)
- [`valid-invalidation-context`](valid-invalidation-context.md)
