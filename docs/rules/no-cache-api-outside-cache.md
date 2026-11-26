# `cache-components/no-cache-api-outside-cache`

Disallow `cacheTag()` and `cacheLife()` where no cache scope exists.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** yes

## Rule details

Next.js throws when `cacheTag()` or `cacheLife()` runs outside a `"use cache"` or `"use cache: private"` function, and when `cacheLife()` runs at module scope. Inside an `unstable_cache()` callback the calls do nothing useful, because `unstable_cache` takes its own `tags` and `revalidate` options.

The rule reports a call only when the file proves that it runs outside a cache scope:

- At module scope.
- Inside a Server Action, a Route Handler, a Client Component, `proxy.ts` or `middleware.ts`, `generateStaticParams`, `generateMetadata`, or the default export of a `page`, `layout`, or other segment file.
- Inside a helper that is not exported and whose callers in the file are all in one of those places.
- Inside an `unstable_cache()` callback, or a helper called only from one.

A helper that is exported is never reported, because a cached function in another file may call it. A component outside a segment file is not reported either, because a cached parent may render it.

## Examples

Invalid:

```ts
import { cacheLife } from "next/cache";

cacheLife("hours");
```

```ts
"use server";
import { cacheTag, updateTag } from "next/cache";

export async function savePost(id: string) {
  cacheTag(`post-${id}`);
  updateTag(`post-${id}`);
}
```

```tsx
// app/posts/page.tsx
import { cacheTag } from "next/cache";

async function loadPosts() {
  cacheTag("posts");
  return db.posts.findMany();
}

export default async function Page() {
  const posts = await loadPosts();
  return <List posts={posts} />;
}
```

Valid:

```ts
import { cacheLife, cacheTag } from "next/cache";

export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts");
  return db.posts.findMany();
}
```

```ts
import { cacheTag } from "next/cache";

export function tagPost(id: string) {
  cacheTag(`post-${id}`);
}
```

## Suggestions

When the enclosing function is an async helper or component, the rule suggests adding `"use cache"` as the first statement of its body. It is a suggestion and not a fix, because it caches the whole function.

## Options

None.

## Related

- Next.js: [`cacheTag()` outside `"use cache"`](https://nextjs.org/docs/messages/cache-tag-outside-use-cache)
- Next.js: [`cacheLife()` outside `"use cache"`](https://nextjs.org/docs/messages/cache-life-outside-use-cache)
