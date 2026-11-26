# `cache-components/require-auth-before-revalidate`

**v0.1 · recommended: warn · strict: error · type: problem · fix: no · suggestions: no**

## Summary

In Server Actions and Route Handlers, reports calls to `revalidateTag`, `revalidatePath`, or `updateTag` that do not have a recognizable authentication call or secret check **before** them in the same function.

`refresh()` is not included. It does not invalidate server-cached data (see the `refresh` docs and code), so its impact is low.

## Rationale

- Data security docs: "By default, when a Server Action is created and exported, it is reachable via a direct POST request… verify authentication and authorization inside each one."
- An action or endpoint that invalidates the cache without auth lets anyone purge it in a loop. The cost is recomputation, invocations, and origin bandwidth, plus a DoS-like slowdown.
- The `revalidatePath` docs include a Route Handler example that reads the path from `searchParams` and revalidates **without** auth. Agents copy that pattern.

This is the only **heuristic** rule in v0.1, so it ships as `warn` in `recommended`.

## Detection

1. Function context: `server-action` or `route-handler` (an HTTP export from `route.ts`).
2. For each invalidation API call inside that function (not inside nested functions, which are evaluated separately):
   - Search **before** the call in the body (in code order, in statements that syntactically dominate the call: the same block or an ancestor block) for either of these:
     - A `CallExpression` whose callee (identifier or `obj.method`) is in `authFunctions`.
     - In Route Handlers: an `if` whose condition compares against `process.env.<name containing SECRET|TOKEN|KEY>`, or reads `headers.get("authorization")` or `headers.get("x-*-secret")`.
   - If neither is found → report.
3. The function is ignored if:
   - The action is wrapped by a higher-order function from `authWrappers` (for example `export const save = withAuth(async () => …)` or `authActionClient.action(async () => …)`).
   - Its name is in `allowPublic`.

Planned for v0.2: use code path analysis (supported by oxlint) for real dominance instead of textual order.

## Options

The defaults are:

```ts
authFunctions: ["auth", "getSession", "getServerSession", "currentUser", "getUser", "verifySession", "requireUser", "requireAuth", "requireSession", "validateRequest", "checkAuth", "getAuth", "getCurrentUser"]
authWrappers: ["withAuth", "authActionClient.action", "protectedAction", "authenticatedAction"]
allowPublic: []
```

## Examples

### Invalid

```ts
"use server";
import { updateTag } from "next/cache";
export async function deletePost(id: string) {
  await db.posts.delete({ where: { id } });
  updateTag("posts");                       // invalid: no auth
}
```

```ts
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (path) revalidatePath(path);           // invalid: anyone can purge any path
  return Response.json({ revalidated: true });
}
```

### Valid

```ts
"use server";
export async function deletePost(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  await db.posts.delete({ where: { id, authorId: session.user.id } });
  updateTag("posts");                       // valid
}
```

```ts
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.REVALIDATE_TOKEN}`) return new Response(null, { status: 401 });
  revalidateTag("posts", "max");            // valid
}
```

## False-positive risk

**High** compared with the other rules, for several reasons:

- Some public actions are legitimate, such as a newsletter form that revalidates a counter.
- Auth can live in middleware or proxy, although the Next docs advise against relying only on that.
- Some auth helpers have custom names.

Mitigations: severity `warn`, the options `authFunctions`, `authWrappers`, and `allowPublic`, and a message that explains how to silence it. Corpus target: under 15% false positives, which keeps it in `recommended` as `warn`. If it goes over that target, it moves to `strict`.

## Messages

- `missingAuth`: ``` This {{context}} calls `{{api}}()` without an auth check. {{contextNoun}} are reachable by direct requests, so anyone could invalidate this cache. Verify the user (or a secret) before invalidating, or list your auth helper in `authFunctions`. See https://nextjs.org/docs/app/guides/data-security ```

`{{context}}` is "Server Action" or "Route Handler"; `{{contextNoun}}` is "Server Actions" or "Route Handlers".

## Tests

- [ ] Action without auth → warn; with `await auth()` before the call → valid; with `auth()` after the invalidation → warn.
- [ ] Route Handler with a check on `process.env.REVALIDATE_SECRET` → valid.
- [ ] `withAuth(async () => …)` → valid.
- [ ] `allowPublic: ["subscribe"]` → valid.
- [ ] Inline `'use server'` inside a component → evaluated.
- [ ] `refresh()` without auth → valid (not included).
