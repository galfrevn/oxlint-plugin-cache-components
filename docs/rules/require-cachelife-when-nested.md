# `cache-components/require-cachelife-when-nested`

Require `cacheLife()` in a cached function that calls a short-lived cached function from the same file.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** yes

## Rule details

A cached function without `cacheLife()` uses the `default` profile. When it calls or renders another cached function whose lifetime is short, Next.js fails during prerender and asks you to choose a lifetime for the outer function.

A lifetime is short when `revalidate` is `0` or `expire` is under 5 minutes. Among the built-in profiles, only `"seconds"` is short.

The rule reports the outer function when:

- It is a `"use cache"`, `"use cache: remote"`, or `"use cache: <handler>"` function, or an export of a `"use cache"` file.
- It has no `cacheLife()` call, directly or in a helper it calls.
- It calls or renders, directly or through helpers without a directive, a cached function whose `cacheLife()` call is `"seconds"`, a profile listed in `shortProfiles`, `{ revalidate: 0 }`, or `{ expire: <literal under 300> }`.

A `cacheLife()` argument that the rule cannot evaluate, such as a variable or an unknown profile name, is never reported.

## Examples

Invalid:

```tsx
import { cacheLife } from "next/cache";

async function StockTicker() {
  "use cache";
  cacheLife("seconds");
  return <span>{await getPrice()}</span>;
}

export default async function ProductPage() {
  "use cache";
  return (
    <main>
      <StockTicker />
    </main>
  );
}
```

```ts
import { cacheLife } from "next/cache";

async function live() {
  "use cache";
  cacheLife({ revalidate: 0 });
  return now();
}

export async function dashboard() {
  "use cache";
  return { live: await live() };
}
```

Valid:

```tsx
export default async function ProductPage() {
  "use cache";
  cacheLife("minutes");
  return (
    <main>
      <StockTicker />
    </main>
  );
}
```

## Suggestions

- Copy the inner `cacheLife()` call into the outer function, which keeps the outer function dynamic.
- Add `cacheLife("minutes")` to the outer function, which prerenders it.

Both suggestions insert the call after the directive and reuse the `cacheLife` import that the inner call already uses.

## Options

```json
{
  "cache-components/require-cachelife-when-nested": [
    "error",
    { "shortProfiles": ["seconds", "realtime"], "followHelpers": true }
  ]
}
```

- `shortProfiles` (`string[]`, default `["seconds"]`): custom profiles from `next.config` whose `expire` is under 5 minutes or whose `revalidate` is `0`. The built-in `"seconds"` profile is always short. It can also be set once in `settings["cache-components"].shortProfiles`.
- `followHelpers` (`boolean`, default `true`): follow calls through helpers without a directive. When `false`, only direct calls and JSX between cached functions count.

## Limitations

- `"use cache: private"` functions are out of scope, because the Next.js error does not cover them.
- Inner functions in other files are not checked.
- Next.js checks `cacheLife()` at run time. An outer `cacheLife()` call in a branch that does not run still counts as explicit for the rule.

## Related

- Next.js: [Nested `"use cache"` without an explicit `cacheLife`](https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife)
- Next.js: [`cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
