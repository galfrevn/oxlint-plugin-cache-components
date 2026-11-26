# `cache-components/no-invalid-cache-nesting`

**v0.1 · recommended: error · type: problem · fix: no · suggestions: no**

## Summary

Reports combinations of cache directives that Next rejects, when the relationship is visible within the file.

## Rationale

Runtime errors (`use-cache-messages.ts`):

- "`"use cache: private"` can't be nested inside `"use cache"` because a shared cached function can't depend on private request data. Nest it only inside another `"use cache: private"`." (`createUseCachePrivateInsidePublicUseCacheError`)
- "`"use cache: private"` can't be used inside `unstable_cache()` because `unstable_cache()` uses a shared cache that can't contain private request data." (`createUseCachePrivateInsideUnstableCacheError`)
- "`"use cache: private"` needs an active request, so it can't be used during `${functionName}` or other build-time contexts." (`createUseCachePrivateOutsideRequestContextError`)

The `use cache: remote` docs (nesting table) say: "Remote caches cannot be nested inside private caches" and "Private caches cannot be nested inside remote caches". For remote inside private, no error was found in the code. **Unverified**: check it in the conformance app. Until then, that case is behind an option.

## Matrix (outer → inner)

| Outer \ Inner | public | remote | private |
|---|---|---|---|
| public (`use cache`, custom) | ok | ok | **error** |
| remote | ok | ok | **error** |
| private | ok (Unverified) | **error (docs)** → option `checkRemoteInPrivate` | ok |
| `unstable_cache` callback | ok | ok | **error** |
| `generateStaticParams` / `unstable_generateParamMatching` | ok | ok | **error** |

## Detection

1. Build a call and JSX graph between the functions in the file, following helpers that have no directive.
2. For each inner function I with kind `private`, search its transitive callers. If any caller is a function with scope `public`, `remote`, `custom`, or `unstable`, or has the `build-time-generator` context, report at the call site closest to the outer function.
3. If `checkRemoteInPrivate` is enabled (default `false`; presets do not set options, so enable it explicitly until the conformance app verifies the case): if I is `remote` and an outer function is `private`, report.
4. A `"use cache: private"` directive in an `unstable_cache()` callback itself reports `privateInUnstableCache` on the directive (`test/e2e/app-dir/cache-components-errors`, fixture `use-cache-private-in-unstable-cache`).
5. The search stops at functions with their own cache scope and at `'use server'` functions. Each call site is reported once. A function passed to `unstable_cache` by reference (`unstable_cache(load, keys)`) counts as an `unstable_cache` callback.

## Examples

### Invalid

```tsx
async function Recommendations() {
  "use cache: private";
  const user = (await cookies()).get("uid");
  return <List items={await recommend(user)} />;
}

export default async function Page() {
  "use cache";
  return <Recommendations />;          // invalid: private inside public
}
```

```ts
import { unstable_cache } from "next/cache";
async function getPrefs() { "use cache: private"; /* … */ }
export const getHome = unstable_cache(async () => ({ prefs: await getPrefs() })); // invalid
```

```ts
async function getUserLocale() { "use cache: private"; /* … */ }
export async function generateStaticParams() {
  const locale = await getUserLocale();  // invalid: private in a build-time context
  return [{ locale }];
}
```

### Valid

```tsx
export default async function Page() {
  return (
    <>
      <CachedShell />                    {/* "use cache" */}
      <Suspense><Recommendations /></Suspense> {/* "use cache: private", outside the public cache */}
    </>
  );
}
```

## Options

```ts
type Options = [{ checkRemoteInPrivate?: boolean }]; // default false in recommended
```

## False-positive risk

Low. The relationship is explicit in the code.

## Messages

- `privateInPublic`: ``` "use cache: private" function `{{inner}}` can't be nested inside {{outerScope}} function `{{outer}}` because a shared cached function can't depend on private request data. Nest it only inside another "use cache: private". See https://nextjs.org/docs/messages/use-cache-private-composition ```
- `privateInUnstableCache`: ``` "use cache: private" function `{{inner}}` can't be used inside `unstable_cache()` because `unstable_cache()` uses a shared cache that can't contain private request data. Call it outside `unstable_cache()`. See https://nextjs.org/docs/messages/use-cache-private-composition ```
- `privateInBuildTime`: ``` "use cache: private" function `{{inner}}` needs an active request, so it can't be used during `{{generator}}`. Move it to a request-time component or function. See https://nextjs.org/docs/messages/use-cache-private-composition ```
- `remoteInPrivate`: ``` "use cache: remote" function `{{inner}}` can't be nested inside "use cache: private" function `{{outer}}`. See https://nextjs.org/docs/app/api-reference/directives/use-cache-remote ```

## Tests

- [ ] `private` inside `public`, through JSX and through a call → error.
- [ ] `private` inside `remote` → error.
- [ ] `private` in the `unstable_cache` callback → error.
- [ ] `private` reached from `generateStaticParams` → error.
- [ ] `private` inside `private` → valid.
- [ ] `remote` inside `private` with the option off → valid; with the option on → error.
- [ ] Through an intermediate helper without a directive → error.
