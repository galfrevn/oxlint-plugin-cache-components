# `cache-components/no-request-api-in-cache`

**v0.1 · recommended: error · type: problem · fix: no · suggestions: no**

## Summary

Reports request-time APIs used inside a cache scope: `cookies()`, `headers()`, `searchParams`, `connection()`, `draftMode().enable()` and `disable()`, and the `request` of a Route Handler. The rule follows helpers **in the same file**.

## Rationale

Next throws at runtime (`use-cache-messages.ts`):

- `cookies()` / `headers()` / `searchParams`: "can't be read inside `"use cache"`. Read it outside the cached function and pass what you need as an argument."
- `connection()`: "can't be called inside `"use cache"` because cached functions may run during prerendering, without an incoming request." It also throws **inside `use cache: private`** ("…may run during prefetching, without a navigation request") and inside `unstable_cache()`. The `connection` docs page says something different ("resolves immediately"), but the code is authoritative (see [research.md](../research.md) §4).
- `draftMode().enable()` / `disable()`: "Draft mode can be read inside a cached function, but enabling or disabling it must happen outside."
- `request.*` in Route Handlers: `createRouteHandlerRequestInUseCacheError`.

According to the `use cache` docs, on a dynamic route the error "can pass `next build` and fail under `next start`". Agents that never start the app never see it.

## Matrix

| API | `use cache` / `remote` / custom | `use cache: private` | `unstable_cache(cb)` |
|---|---|---|---|
| `cookies()`, `headers()` | error | allowed | error |
| `searchParams` (page prop) | error | allowed | error |
| `connection()` | error | **error** | error |
| `draftMode().enable()` / `.disable()` | error | **Unverified**; not reported in v0.1 | error |
| `draftMode().isEnabled` | allowed | allowed | allowed |
| `request.*` of a Route Handler | error | **Unverified**; not reported | error |
| `next/root-params` | allowed | allowed | allowed |

## Detection

1. **Prefilter** in `before`: if the source text contains none of `next/headers`, `next/server`, `searchParams`, or any configured `requestApis` entry, return `false`.
2. **Bindings:** `cookies`, `headers`, and `draftMode` from `next/headers`; `connection` from `next/server`; `unstable_cache` from `next/cache`; and the `requestApis` option entries. Aliases and namespace imports are included.
3. **Direct uses.** For each `CallExpression` to those bindings (with or without `await`, and also inside a chained `.get()`):
   - Compute `getCacheScope(call)`.
   - If there is a scope and the matrix says error, report the call.
   - For `draftMode`, report only a `MemberExpression` `.enable` or `.disable` on the result, whether it is `(await draftMode()).enable()` or a variable.
4. **`searchParams`:** in a function with a `CacheScope` that is a segment component (`page`), report if the `searchParams` parameter (destructured, or as `props.searchParams`) is **read**: awaited, accessed as a member, or passed to another function. Declaring it without using it is not reported.
5. **Route Handler:** in `route-handler` files, if a cached function (for example, a closure defined inside `GET`) references the first parameter of an exported method (`request` or `req`) and accesses `.headers`, `.cookies`, `.nextUrl`, `.url`, `.json`, `.text`, `.formData`, `.body`, or `.signal`, report it.
6. **Transitive, same file.** For each function F **without** a cache scope that uses a request API, search the call graph for each cached function C that reaches F (`reachableFrom`, depth 10). Report **at the call site inside C** with the `transitive` message. There is one report per (C, API) pair. If the helper reads several APIs, the first one is reported.
7. Functions with `'use server'` stop the search. A nested action does not inherit the cache scope.

## Examples

### Invalid

```tsx
import { cookies } from "next/headers";

export async function Header() {
  "use cache";
  const theme = (await cookies()).get("theme"); // invalid: cookies
  return <header data-theme={theme?.value} />;
}
```

```tsx
import { cookies } from "next/headers";

async function getTheme() {
  return (await cookies()).get("theme")?.value;
}

export async function Header() {
  "use cache";
  const theme = await getTheme(); // invalid: transitive (getTheme reads cookies on line 4)
  return <header data-theme={theme} />;
}
```

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await searchParams; // invalid: searchParams
  return <Results q={q} />;
}
```

```ts
import { connection } from "next/server";
export async function getStats() {
  "use cache: private";
  await connection(); // invalid: connection in private
}
```

```ts
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
export const getLocale = unstable_cache(async () => (await headers()).get("accept-language")); // invalid: in unstable_cache
```

### Valid

```tsx
import { cookies } from "next/headers";
export default async function Page() {
  const theme = (await cookies()).get("theme")?.value;
  return <Header theme={theme} />;           // valid: read outside and passed as an argument
}
async function Header({ theme }: { theme?: string }) {
  "use cache";
  return <header data-theme={theme} />;
}
```

```ts
import { cookies } from "next/headers";
export async function getCart() {
  "use cache: private";
  return (await cookies()).get("cart");      // valid: private allows cookies
}
```

```ts
import { draftMode } from "next/headers";
export async function getPost(slug: string) {
  "use cache";
  const { isEnabled } = await draftMode();   // valid: reading isEnabled is allowed
}
```

## Options

```ts
type Options = [{
  requestApis?: string[];   // e.g. ["auth", "next-auth:auth", "@clerk/nextjs/server:currentUser"]
  checkTransitive?: boolean; // default true
}];
```

`requestApis`: calls treated like `cookies()`. An entry without `module:` matches any import with that name. An entry with `module:export` matches only that export.

## Edge cases

- A file-level `'use cache'`: the exports are cached. Non-exported functions in the file are **not** cached on their own, but if an export calls them, the transitive check covers them.
- A `cookies()` call inside a nested function (for example, a `.map` callback) inside a cached function **is** in scope.
- A function that reads cookies and is passed as a callback (not called) has no edge in the graph, so it is not reported.
- A `cookies` identifier shadowed by a local variable does not count. This is why resolution uses scope analysis.
- A cached closure inside a component: `"use cache"` inside an inner function is valid in Next. If it references `cookies` from the outer scope, that read happened outside the cache and is valid.

## False-positive risk

Low for direct uses, which are deterministic. Medium for transitive uses, when a helper reads cookies only in a branch that does not run from the cached function. If the corpus shows more than 5% false positives for the `transitive` message, that message ID will require an explicit `checkTransitive: true`.

## Messages

- `requestApi`: ``` `{{api}}` can't be read inside {{scope}}. Read it outside the cached function and pass what you need as an argument. See {{url}} ```
- `searchParams`: ``` `searchParams` can't be read inside {{scope}}. Await it outside the cached function and pass what you need as an argument. See {{url}} ```
- `connection`: ``` `connection()` can't be called inside {{scope}} because cached functions may run during prerendering, without an incoming request. Call it outside the cached function. See {{url}} ```
- `connectionPrivate`: ``` `connection()` can't be called inside "use cache: private" because private cached functions may run during prefetching, without a navigation request. Call it outside the cached function. See https://nextjs.org/docs/app/api-reference/directives/use-cache-private ```
- `draftModeMutation`: ``` `draftMode().{{method}}()` can't be called inside {{scope}}. Draft mode can be read inside a cached function, but enabling or disabling it must happen outside. See {{url}} ```
- `routeHandlerRequest`: ``` `{{expression}}` can't be read inside {{scope}}. Read it outside the cached function and pass what you need as an argument. See {{url}} ```
- `transitive`: ``` `{{helper}}()` reads `{{api}}` (line {{line}}), and it's called inside {{scope}} function `{{fn}}`. Read the value outside the cached function and pass it as an argument. See {{url}} ```

`{{scope}}` is one of `"use cache"`, `"use cache: remote"`, `"use cache: {{name}}"`, or `unstable_cache()`. `{{url}}` is `https://nextjs.org/docs/messages/next-request-in-use-cache` (or the `unstable_cache` docs page).

## Tests

- [ ] `cookies`, `headers`, and `connection` called directly inside `use cache`, `use cache: remote`, and `unstable_cache` → error.
- [ ] `cookies` and `headers` inside `private` → valid; `connection` inside `private` → `connectionPrivate`.
- [ ] Alias `import { cookies as c }` and namespace import.
- [ ] Local shadowing of `cookies` → valid.
- [ ] `searchParams` read in a cached page → error; declared but not read → valid.
- [ ] `draftMode().isEnabled` → valid; `.enable()` → error.
- [ ] Transitive, at 1 and 3 levels; cycle A→B→A without an infinite loop.
- [ ] Helper called only from an uncached function → valid.
- [ ] File-level `'use cache'` plus an export that reads cookies → error.
- [ ] Route Handler: cached closure that reads `request.headers` → error.
- [ ] `requestApis: ["auth"]` plus `auth()` inside `use cache` → error.
- [ ] Fixtures derived from `vercel/next.js/test/e2e/app-dir/cache-components-request-apis` (with attribution).
