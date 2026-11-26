# `cache-components/valid-invalidation-context`

Require `revalidateTag()`, `revalidatePath()`, `updateTag()`, and `refresh()` to run where Next.js allows them.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** yes

## Rule details

Next.js throws when cache invalidation runs inside a cached function, during render, or inside `generateStaticParams`. `updateTag()` and `refresh()` only work in Server Actions. Invalidation does not work in Client Components or in Proxy.

| Context | `revalidateTag`, `revalidatePath` | `updateTag` | `refresh` |
|---|---|---|---|
| Server Action | allowed | allowed | allowed |
| Route Handler | allowed | error | error |
| Cached function (any kind, including `unstable_cache`) | error | error | error |
| Server Component render | error | error | error |
| `generateMetadata`, `generateViewport` | not reported | error | error |
| `generateStaticParams`, `unstable_generateParamMatching` | error | error | error |
| `proxy.ts`, `middleware.ts` | error | error | error |
| Client Component | error | error | error |

A helper without a directive takes the contexts of its callers in the same file. When a helper is reached from several contexts, the rule reports the most specific one, in the order Next.js checks them: build-time generator, cached function, render, then the rest. An exported helper with no callers in the file is not reported. An `after()` callback is not reported.

## Examples

Invalid:

```ts
// app/api/posts/route.ts
import { updateTag } from "next/cache";

export async function POST(req: Request) {
  await savePost(await req.json());
  updateTag("posts");
  return Response.json({ ok: true });
}
```

```tsx
// app/page.tsx
import { revalidatePath } from "next/cache";

export default async function Page() {
  revalidatePath("/");
  return <Home />;
}
```

```ts
import { revalidateTag } from "next/cache";

export async function getPosts() {
  "use cache";
  revalidateTag("posts", "max");
}
```

Valid:

```ts
"use server";
import { refresh, updateTag } from "next/cache";

export async function createPost(data: FormData) {
  await db.posts.create(parse(data));
  updateTag("posts");
  refresh();
}
```

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";

export async function POST(req: Request) {
  if (req.headers.get("x-secret") !== process.env.REVALIDATE_SECRET) {
    return new Response(null, { status: 401 });
  }
  revalidateTag("posts", "max");
  return Response.json({ ok: true });
}
```

## Suggestions

For `updateTag(tag)` in a Route Handler, the rule suggests `revalidateTag(tag, { expire: 0 })`, which keeps the immediate expiration. It adds `revalidateTag` to the existing `next/cache` import when needed. `refresh()` has no Route Handler equivalent, so it has no suggestion.

## Options

```json
{
  "cache-components/valid-invalidation-context": ["error", { "appDir": ["app", "src/app"] }]
}
```

- `appDir` (`string[]`, default `["app", "src/app"]`): App Router directories, used to recognize `route`, `page`, and other segment files. It can also be set once for every rule in `settings["cache-components"].appDir`.

## Limitations

- A component is recognized as a Server Component when it is the default export of a segment file, or a PascalCase function that returns JSX in a file without `"use client"` or `"use server"`.
- Helpers imported from other files are not followed.

## Related

- Next.js: [Revalidation inside `"use cache"` or during render](https://nextjs.org/docs/messages/revalidate-in-use-cache)
- Next.js: [`updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag)
- Next.js: [`refresh`](https://nextjs.org/docs/app/api-reference/functions/refresh)
- [`require-auth-before-revalidate`](require-auth-before-revalidate.md)
