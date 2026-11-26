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

1. Function context: `server-action` or `route-handler` (an HTTP export from `route.ts`). A callback passed to another call, such as `tags.map((tag) => revalidateTag(tag, "max"))`, belongs to the enclosing function.
2. For the first invalidation API call inside that function (one report per function), search the code **before** the call for an auth signal. A recognized check must syntactically dominate the call: it is in the same block or in an ancestor block, or in the head of an enclosing statement such as an `if` test. Recognized checks:
   - A `CallExpression` whose callee (identifier or `obj.method`) matches an entry of `authFunctions`. A plain entry matches the last segment of a member chain; a dotted entry matches the end of the chain.
   - A call whose last segment contains `auth` (not `author`), `session`, `permission`, `signature`, `webhook`, `verif`, `guard`, or `protect`.
   - A call to a function imported from a module whose specifier contains `auth` or `session`, or starts with `@clerk/`.
   - A rate limit: a call with a segment matching `rate limit` or `limiter`, or whose last segment ends with `Limit`.
   - In Route Handlers: an equality comparison against `process.env.<name containing SECRET|TOKEN|KEY>` or a constant whose name contains `SECRET`; a call whose name contains `equal`, `compare`, `verify`, `valid`, or `check` and that receives such a secret; or a read of `headers.get("authorization")`, `headers.get("x-*-secret")`, `headers.get("x-*-token")`, `headers.get("x-*-key")`, `headers.get("x-*-signature")`, or `headers.get("x-*-hmac*")`.
3. With `trustAwaitedCalls` (default `true`), an awaited call to a function, imported from a module other than `next/cache`, `next/navigation`, `next/server`, and `react`, or declared in the same file, also stops the rule, wherever it appears before the invalidation. Member calls such as `await db.posts.delete()` do not count.
4. If no signal is found → report.
5. The function is ignored if:
   - The action is wrapped by a higher-order function from `authWrappers` (for example `export const save = withAuth(async () => …)` or `authActionClient.action(async () => …)`), or by a wrapper call chain with a segment that contains `auth`, `admin`, `permission`, `protected`, `private`, `session`, or `secure` (for example `adminProcedure.input(schema).action(fn)`).
   - Its name is in `allowPublic`.

Planned for v0.2: use code path analysis (supported by oxlint) for real dominance instead of textual order.

### Why the extra signals

The first corpus run on 2026-11-26 reviewed 30 of 311 reports and found about 19 false positives. Most came from two patterns: auth helpers with custom names (`requireAdmin()`, `requireCronAuth()`, `adminProcedure`), and Server Actions that delegate to a data access layer in another file, which checks auth inside (`await deleteWorkspace(slug)`). The Next.js data security guide recommends that layer, and a per-file rule cannot see into it. Following [ADR-005](../decisions.md#adr-005-per-file-analysis-and-false-positive-policy), the rule treats both as possible checks. The second run reported 98 findings, and a sample of 30 had 2 false positives, which the `permission` wrapper pattern then removed. See `scripts/corpus/triage.md`.

## Options

The defaults are:

```ts
authFunctions: ["auth", "getSession", "getServerSession", "currentUser", "getUser", "verifySession", "requireUser", "requireAuth", "requireSession", "validateRequest", "checkAuth", "getAuth", "getCurrentUser"]
authWrappers: ["withAuth", "authActionClient.action", "protectedAction", "authenticatedAction"]
allowPublic: []
trustAwaitedCalls: true
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

Mitigations: severity `warn`, the options `authFunctions`, `authWrappers`, `allowPublic`, and `trustAwaitedCalls`, and a message that explains how to silence it. Entries in `authFunctions` and `authWrappers` are added to the defaults. Corpus target: under 15% false positives, which keeps it in `recommended` as `warn`. If it goes over that target, it moves to `strict`. The measured rate after the changes above is in `scripts/corpus/triage.md`.

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
- [ ] Auth-like names, auth modules, rate limits, secret constants, and HMAC headers → valid.
- [ ] Awaited data access helper → valid; with `trustAwaitedCalls: false` → warn.
- [ ] Awaited member call on an imported client (`await db.posts.delete()`) → warn.
- [ ] Two invalidation calls in one action → one report.
