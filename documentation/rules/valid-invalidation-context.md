# `cache-components/valid-invalidation-context`

**v0.1 · recommended: error · type: problem · fix: no · suggestions: yes**

## Summary

Checks that `revalidateTag`, `revalidatePath`, `updateTag`, and `refresh` are called only where Next allows them.

## Rationale

Next's code (`revalidate.ts` and `use-cache-messages.ts`):

- Inside cached functions (`cache`, `private-cache`, or `unstable-cache`): "`${expression}` can't be called inside a cached function. Call it from a Server Action or Route Handler instead."
- During render: "`${expression}` can't be called during render. Call it from a Server Action or Route Handler instead."
- Inside `generateStaticParams` or `unstable_generateParamMatching`: "`${expression}` can't be called inside `${generatorName}`…"
- `updateTag` outside a Server Action, including Route Handlers: "updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead."
- `refresh` outside a Server Action: "refresh can only be called from within a Server Action."
- The `revalidateTag` docs: "cannot be called in Client Components or Proxy".

## Matrix (effective context → API)

| Context | `revalidateTag` / `revalidatePath` | `updateTag` | `refresh` |
|---|---|---|---|
| `server-action` | ok | ok | ok |
| `route-handler` | ok | **error** → suggestion `revalidateTag(tag, { expire: 0 })` | **error** |
| `cached` (any kind) | **error** | **error** | **error** |
| `component-render` | **error** | **error** | **error** |
| `metadata` (`generateMetadata`, `generateViewport`) | **Unverified**; not reported in v0.1 | **error** (not an action) | **error** |
| `build-time-generator` | **error** | **error** | **error** |
| `proxy` (proxy.ts / middleware.ts) | **error** | **error** | **error** |
| `client` | **error** | **error** | **error** |
| `unknown` | not reported | not reported | not reported |

## Detection

1. Bindings from `next/cache`: `revalidateTag`, `revalidatePath`, `updateTag`, and `refresh`.
2. For each call, compute `getEffectiveContexts(call)`. The result is a set, because a helper can be called from several contexts.
3. Report if **any** provable effective context is invalid for that API. The message names the context and, when relevant, the caller.
4. Priority when several contexts are invalid (same as Next): `build-time-generator` > `cached` > `component-render` > the rest.
5. If all contexts are `unknown` or valid, do not report.

## Examples

### Invalid

```ts
// app/api/posts/route.ts
import { updateTag } from "next/cache";
export async function POST(req: Request) {
  await savePost(await req.json());
  updateTag("posts");                     // invalid: updateTag in a Route Handler
  return Response.json({ ok: true });
}
```

```tsx
import { revalidatePath } from "next/cache";
export default async function Page() {
  revalidatePath("/");                    // invalid: during render
  return <Home />;
}
```

```ts
import { revalidateTag } from "next/cache";
export async function getPosts() {
  "use cache";
  revalidateTag("posts", "max");          // invalid: inside a cached function
}
```

```ts
"use client";
import { refresh } from "next/cache";
export function Button() { return <button onClick={() => refresh()} />; } // invalid: client (the build may already fail when next/cache is imported in the client; Unverified)
```

### Valid

```ts
"use server";
import { updateTag, refresh } from "next/cache";
export async function createPost(data: FormData) {
  await db.posts.create(parse(data));
  updateTag("posts");                     // valid
  refresh();                              // valid
}
```

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";
export async function POST(req: Request) {
  if (req.headers.get("x-secret") !== process.env.REVALIDATE_SECRET) return new Response(null, { status: 401 });
  revalidateTag("posts", "max");          // valid
  return Response.json({ ok: true });
}
```

## Fixes and suggestions

- `updateTag` in a Route Handler → `useRevalidateTag`: replace it with `revalidateTag(<tag>, { expire: 0 })`, which keeps the immediate expiration. If the import is missing, add it.
- `refresh` in a Route Handler: no suggestion, because there is no equivalent.

## Edge cases

- Inline actions: `async function save() { "use server"; updateTag("x"); }` inside a server component has the `server-action` context, so it is valid.
- A non-exported helper called from an action and from a component is reported, because of the `component-render` context.
- An exported helper with no callers in the file has the `unknown` context, so it is not reported.
- `after(() => revalidateTag(...))`: Next has a test named `revalidate-tag-in-after`. **Unverified**: check how it behaves. In v0.1, an `after` callback is treated as `unknown`.

## False-positive risk

Low for `server-action`, `route-handler`, `cached`, `proxy`, and `client`. Medium for `component-render`, because it relies on the heuristic "PascalCase function that returns JSX". If the corpus shows problems, `component-render` will be restricted to default exports of segment files.

## Messages

- `inCachedFunction`: ``` `{{api}}()` can't be called inside a cached function ({{scope}} `{{fn}}`). Call it from a Server Action or Route Handler instead. See https://nextjs.org/docs/messages/revalidate-in-use-cache ```
- `duringRender`: ``` `{{api}}()` can't be called during render (`{{fn}}` is a Server Component). Call it from a Server Action or Route Handler instead. See https://nextjs.org/docs/messages/revalidate-in-use-cache ```
- `inBuildTimeGenerator`: ``` `{{api}}()` can't be called inside `{{generator}}`. Call it from a Server Action or Route Handler instead. See https://nextjs.org/docs/messages/revalidate-in-use-cache ```
- `updateTagOutsideAction`: ``` `updateTag()` can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use `revalidateTag()` instead. See https://nextjs.org/docs/app/api-reference/functions/updateTag ```
- `refreshOutsideAction`: ``` `refresh()` can only be called from within a Server Action. In Client Components, use `router.refresh()`. See https://nextjs.org/docs/app/api-reference/functions/refresh ```
- `inProxyOrClient`: ``` `{{api}}()` only works in Server Actions and Route Handlers, not in {{where}}. See https://nextjs.org/docs/app/api-reference/functions/revalidateTag ```

## Tests

- [ ] Each matrix cell has at least one case.
- [ ] Inline `'use server'` inside a component → valid.
- [ ] Helper shared between an action and a component → `duringRender`.
- [ ] The `updateTag` suggestion produces `revalidateTag(tag, { expire: 0 })` and the import.
- [ ] `src/app/**/route.ts` and `app/**/route.js` are recognized; `lib/route.ts` is not.
- [ ] Both `proxy.ts` and `middleware.ts`, at the root and in `src/`.
