# `cache-components/require-cachelife-when-nested`

**v0.1 · recommended: error · type: problem · fix: no · suggestions: yes**

## Summary

If a cached function **without** `cacheLife()` calls or renders another cached function from the same file whose `cacheLife` is short-lived (`revalidate: 0` or `expire` under 5 minutes), the rule reports the outer function.

## Rationale

Next fails during prerender (`use-cache-messages.ts`):

- "A nested `"use cache"` with `revalidate: 0` is inside an outer `"use cache"` that has no `cacheLife()`. Add `cacheLife()` to the outer one to choose whether to prerender it with a non-zero `revalidate` or keep it dynamic with `revalidate: 0`."
- "A nested `"use cache"` with a short `expire` (under 5 minutes) is inside an outer `"use cache"` that has no `cacheLife()`…"

The `cacheLife` docs define short as "`revalidate` of `0`, or `expire` under 5 minutes". Among the presets, only `seconds` (expire 1 minute) matches that definition. Without an explicit `cacheLife`, the outer function uses the `default` profile.

## Detection

1. Build the graph of cached functions in the file. Edges come from `CallExpression` and `JSXOpeningElement`, plus (optionally, with `followHelpers`) edges through helpers that have no directive.
2. For each **inner** cached function I with kind `public`, `remote`, or `custom`, find `cacheLife` calls within its scope and parse them with `parseCacheLifeCall`:
   - `cacheLife("seconds")` or a name listed in `shortProfiles` → short.
   - `cacheLife({ revalidate: 0 })` or `cacheLife({ expire: <numeric literal < 300> })` → short.
   - Anything else (identifier, unknown name, expression) → `unknown` → **do not report**.
   - If there are several calls (in branches), one short call is enough.
3. For each **outer** cached function O that reaches I (directly or through helpers, depth ≤ 10):
   - If O has **any** `cacheLife` call in its own scope (even a conditional one) → valid.
   - Otherwise → report on O's directive node, naming I and its profile.
4. Out of scope in v0.1: O or I with kind `private` (Next does not mention it in the error), functions from other files, and undeclared custom profiles.

## Examples

### Invalid

```tsx
import { cacheLife } from "next/cache";

async function StockTicker() {
  "use cache";
  cacheLife("seconds");
  return <span>{await getPrice()}</span>;
}

export default async function ProductPage() {
  "use cache";                        // invalid: no cacheLife, renders StockTicker (seconds)
  return <main><StockTicker /></main>;
}
```

```ts
import { cacheLife } from "next/cache";
async function live() { "use cache"; cacheLife({ revalidate: 0 }); return now(); }
export async function dashboard() { "use cache"; return { live: await live() }; } // invalid
```

### Valid

```tsx
export default async function ProductPage() {
  "use cache";
  cacheLife("minutes");               // valid: the outer function sets its lifetime explicitly
  return <main><StockTicker /></main>;
}
```

```tsx
async function Catalog() { "use cache"; cacheLife("hours"); /* … */ }
export default async function Page() { "use cache"; return <Catalog />; } // valid: the inner function is not short-lived
```

## Options

```ts
type Options = [{ shortProfiles?: string[]; followHelpers?: boolean }]; // defaults: ["seconds"], true
```

## Fixes and suggestions

On the outer function, `addCacheLifeShort` inserts `cacheLife("{{innerProfile}}");` after the directive, which keeps it dynamic. `addCacheLifeMinutes` inserts `cacheLife("minutes");`, which prerenders it. If the import is missing, the suggestion adds `cacheLife` to the existing `next/cache` import or creates a new one.

## Edge cases

- An outer function with `cacheLife` in only one branch counts as explicit. Next checks whether the call exists at run time, so the case of an unexecuted branch is an accepted false negative.
- An inner function in another file is an accepted false negative (v2).
- `cacheLife` with a variable is `unknown` and is not reported.
- **Unverified:** whether Next also fails when the inner function is `private` or `remote`.

## False-positive risk

Low. The rule only reports literals it can evaluate.

## Messages

- `zeroRevalidate`: ``` "use cache" function `{{outer}}` has no `cacheLife()`, but it calls `{{inner}}`, which uses `revalidate: 0`. Add `cacheLife()` to `{{outer}}` to choose whether to prerender it with a non-zero `revalidate` or keep it dynamic. See https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife ```
- `shortExpire`: ``` "use cache" function `{{outer}}` has no `cacheLife()`, but it calls `{{inner}}`, whose `expire` is under 5 minutes ({{profile}}). Add `cacheLife()` to `{{outer}}` to choose whether to prerender it with a longer `expire` or keep it dynamic. See https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife ```

## Tests

- [ ] JSX: the outer function renders an inner function with `seconds` → `shortExpire`.
- [ ] Call with `{ revalidate: 0 }` → `zeroRevalidate`.
- [ ] `{ expire: 299 }` → error; `{ expire: 300 }` → valid.
- [ ] Outer function with a conditional `cacheLife` → valid.
- [ ] Through a helper without a directive (`followHelpers` true/false).
- [ ] Custom profile in `shortProfiles` → error; not configured → valid.
- [ ] Suggestions with and without an existing import.
