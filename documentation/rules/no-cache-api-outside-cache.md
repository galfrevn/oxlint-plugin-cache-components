# `cache-components/no-cache-api-outside-cache`

**v0.1 · recommended: error · type: problem · fix: no · suggestions: yes (adds `'use cache'`)**

## Summary

Reports `cacheTag()` and `cacheLife()` calls where there is provably no `use cache` or `use cache: private` scope.

## Rationale

Next throws at runtime:

- "`cacheTag()` can only be called inside a `"use cache"` or `"use cache: private"` function." (`createCacheTagOutsideUseCacheError`)
- "`cacheLife()` can only be called inside a `"use cache"` or `"use cache: private"` function." (`createCacheLifeOutsideUseCacheError`)
- The `cacheLife` docs add: "`cacheLife` cannot be used at module scope. Calling it at the top level of a file will throw an error."

Agents often make this mistake. They call `cacheTag` in a Server Action or in an uncached fetch, by analogy with the old `fetch(url, { next: { tags } })`.

## Detection

1. Bindings `cacheTag` and `cacheLife` from `next/cache`. Also `unstable_cacheTag` and `unstable_cacheLife`, which `next/cache` still exports as deprecated aliases (**Verified** in `packages/next/cache.js`, 2026-11-26).
2. For each call:
   - If `getCacheScope(call)` is `public`, `remote`, `custom`, or `private`, the call is valid.
   - If the scope is `unstable` (a `unstable_cache` callback), **report** it. `unstable_cache` uses its own `tags` and `revalidate` options.
   - If there is no scope, compute `getEffectiveContexts(call)`:
     - **Module scope** (no enclosing function): report `moduleScope`.
     - If the enclosing function, or any function on the ancestor path, is `server-action`, `route-handler`, `client`, `proxy`, `build-time-generator`, or `metadata`, or is the default export of a render segment file (`page`, `layout`, `template`, `default`, `not-found`, `loading`, `forbidden`, `unauthorized`, `global-not-found`): report `outside`.
     - If the function is a **non-exported** helper and **all** of its callers in the file are in one of those contexts: report `outside`. If every caller is in one of those contexts or in an `unstable_cache` callback, and at least one is in an `unstable_cache` callback, report `unstableCache`.
     - If the function is an **exported** helper without a directive, and the file is not `'use cache'`: **do not report**. It may be called from a cached function in another file ([ADR-005](../decisions.md#adr-005-per-file-analysis-and-false-positive-policy)).
     - A PascalCase component outside a segment file is **not** treated as outside a cache scope. A cached parent in another file may render it, and its render then runs inside that cache, where `cacheTag()` works. A playground in the corpus relies on this behavior.

## Examples

### Invalid

```ts
import { cacheLife } from "next/cache";
cacheLife("hours");                           // invalid: moduleScope
```

```ts
"use server";
import { cacheTag, updateTag } from "next/cache";
export async function savePost(id: string) {
  cacheTag(`post-${id}`);                     // invalid: inside a Server Action
  updateTag(`post-${id}`);
}
```

```ts
// app/api/posts/route.ts
import { cacheLife } from "next/cache";
export async function GET() {
  cacheLife("minutes");                       // invalid: inside a Route Handler
  return Response.json(await getPosts());
}
```

```tsx
import { cacheTag } from "next/cache";
async function loadPosts() { cacheTag("posts"); return db.posts.findMany(); } // invalid: non-exported helper
export default async function Page() {
  const posts = await loadPosts();            // the only caller is not cached
  return <List posts={posts} />;
}
```

### Valid

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
export function tagPost(id: string) { cacheTag(`post-${id}`); } // valid: exported helper, could be called from a cached scope in another file
```

```ts
"use cache";
import { cacheLife } from "next/cache";
export async function getMenu() { cacheLife("days"); return fetchMenu(); } // valid: file-level use cache
```

## Options

None in v0.1.

## Fixes and suggestions

If the enclosing function is `async`, has a block body, and is a helper, a component, or a metadata generator (not a Server Action, Route Handler, client, proxy, or build-time function), the rule suggests `addUseCache`. The suggestion inserts `"use cache";` as the first statement of the body. It is only a suggestion because it changes semantics: it caches the whole function.

## Edge cases

- Conditional calls inside a valid scope are valid.
- `cacheLife` inside `use cache: private` is valid, according to Next's message.
- A non-exported helper with one cached caller and one uncached caller is reported only if **no** caller is cached (conservative).

## False-positive risk

Low. The rule reports only in provable contexts. The main risk is misclassifying `component-render`, so a component without clear signals falls into `unknown` and is not reported.

## Messages

- `outside`: ``` `{{api}}()` can only be called inside a "use cache" or "use cache: private" function. Add the directive to the function that should be cached, or move this call into one. See {{url}} ```
- `moduleScope`: ``` `{{api}}()` can't be called at module scope. Call it inside a "use cache" function. See {{url}} ```
- `unstableCache`: ``` `{{api}}()` doesn't work inside `unstable_cache()`. Use the `tags` or `revalidate` options of `unstable_cache`, or switch this function to "use cache". See {{url}} ```
- Suggestion `addUseCache`: ``` Add "use cache" to `{{fn}}` ```

`{{url}}` is `https://nextjs.org/docs/messages/cache-tag-outside-use-cache` or `…/cache-life-outside-use-cache`.

## Tests

- [ ] Module scope → `moduleScope`.
- [ ] Inside a Server Action (a `'use server'` file and an inline directive) → `outside`.
- [ ] Inside `GET` in `app/**/route.ts` → `outside`.
- [ ] `unstable_cache` callback → `unstableCache`.
- [ ] Non-exported helper with a single uncached caller → `outside`; exported helper → valid.
- [ ] Inside `use cache`, `use cache: private`, and `use cache: remote` → valid.
- [ ] Inside `generateStaticParams` and a client component → `outside`.
- [ ] Helper called only from an `unstable_cache` callback → `unstableCache`.
- [ ] Component outside a segment file → valid.
- [ ] `addUseCache` suggestion produces the expected code.
