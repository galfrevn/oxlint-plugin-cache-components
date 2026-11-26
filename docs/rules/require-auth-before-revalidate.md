# `cache-components/require-auth-before-revalidate`

Require an auth check before cache invalidation in Server Actions and Route Handlers.

**Preset:** `recommended` (warn), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

Every exported Server Action and every Route Handler is reachable by a direct request. The Next.js data security guide says to verify authentication and authorization inside each one. An action or endpoint that invalidates the cache without a check lets anyone purge it in a loop, which costs recomputation, function invocations, and origin bandwidth.

This rule is a heuristic, so it ships as `warn` in `recommended`. It is not a security control and does not prove that an endpoint is safe.

In a Server Action or a Route Handler, the rule reports the first `revalidateTag()`, `revalidatePath()`, or `updateTag()` call that has no auth check before it. A check counts when it runs earlier in the same block, or in an enclosing block, of the same function:

- A call to a function listed in `authFunctions`. An entry such as `getUser` also matches member calls such as `supabase.auth.getUser()`. An entry such as `auth.api.getSession` matches the end of a member chain.
- In Route Handlers only: an equality comparison with `process.env.<NAME>` where the name contains `SECRET`, `TOKEN`, or `KEY`; a call such as `verifySignature(body, process.env.WEBHOOK_SECRET)`; or a read of `headers.get("authorization")` or `headers.get("x-...-secret")`.

The rule skips a function that is wrapped by an entry of `authWrappers`, and a function whose name is listed in `allowPublic`. `refresh()` is not checked, because it does not invalidate server-cached data.

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
      "allowPublic": ["subscribe"]
    }
  ]
}
```

- `authFunctions` (`string[]`): functions whose call counts as an auth check. Entries are added to the defaults: `auth`, `checkAuth`, `currentUser`, `getAuth`, `getCurrentUser`, `getServerSession`, `getSession`, `getUser`, `requireAuth`, `requireSession`, `requireUser`, `validateRequest`, and `verifySession`.
- `authWrappers` (`string[]`): higher-order functions that wrap the action with auth. Entries are added to the defaults: `withAuth`, `authActionClient.action`, `protectedAction`, and `authenticatedAction`. A dotted entry such as `authActionClient.action` also matches `authActionClient.inputSchema(schema).action(fn)`.
- `allowPublic` (`string[]`, default `[]`): names of actions or handlers that are public on purpose, such as a newsletter form.
- `appDir` (`string[]`, default `["app", "src/app"]`): App Router directories, used to recognize `route` files.

`authFunctions`, `authWrappers`, and `appDir` can also be set once in `settings["cache-components"]`.

## Limitations

- Order is checked by position in the code, not by control flow. A check inside a `try` block, or in only one branch, does not count.
- Auth enforced only in `proxy.ts` or `middleware.ts` is not visible to the rule. The Next.js docs advise against relying only on it.
- Helpers that invalidate the cache are not checked. Only the Server Action or Route Handler itself is.

## Related

- Next.js: [Data security](https://nextjs.org/docs/app/guides/data-security)
- [`valid-invalidation-context`](valid-invalidation-context.md)
