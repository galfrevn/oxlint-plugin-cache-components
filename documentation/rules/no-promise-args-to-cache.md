# `cache-components/no-promise-args-to-cache`

**v0.1 · recommended: error · type: problem · fix: no · suggestions: no**

## Summary

Reports request-data promises (`searchParams`, `cookies()`, `headers()`, and, optionally, `params`) passed **without `await`** to a cached function or component in the same file.

## Rationale

The `use cache` docs ("Build Hangs (Cache Timeout)") say that if you access promises that resolve to runtime or uncached data, created outside the `use cache` boundary, "The cached function waits for data that can't resolve during the build, causing a timeout after 50 seconds". The error is "Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or uncached data were used inside "use cache"."

This error is expensive. The code gives no clear message, only a 50-second wait during the build. Agents make it when they apply the "pass the promise to the child" pattern. That pattern is correct for **uncached** children (caching docs: "You can also pass the entire `params` promise and await it in the child component") and wrong for cached children.

## Detection

0. **Prefilter** in `before`: the source text must contain `use cache`, and one of `params`, `Params`, `next/headers`, or the name of a configured `requestApis` entry.

1. Identify the cached functions and components in the file: a function directive, or an export from a `'use cache'` file.
2. Walk their call sites: a `CallExpression` whose callee resolves to the cached function, and a `JSXOpeningElement` for the cached component. Each attribute is an argument.
3. An argument or attribute is a **request promise** if it is:
   - A direct reference to the `searchParams` parameter (destructured, or as `props.searchParams`) of a segment component, **without** `await`.
   - `cookies()`, `headers()`, or `draftMode()` without `await`, or an identifier bound to one of those calls without `await` (`const c = cookies()`).
   - With `checkParams: true`, also the segment's `params` without `await`.
   - An identifier bound to `connection()` is ignored. `no-request-api-in-cache` already covers it when it is used inside the cache.
4. If the argument is wrapped in `await`, or destructured before it is passed, it is valid.

## Examples

### Invalid

```tsx
export default function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Results query={searchParams} />;   // invalid: Results is "use cache"
}

async function Results({ query }: { query: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await query;
  return <List items={await search(q)} />;
}
```

```ts
import { cookies } from "next/headers";
export default async function Page() {
  return <Prefs store={cookies()} />;        // invalid: if Prefs is "use cache"
}
```

### Valid

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Results q={q} />;                   // valid: resolved value
}
```

```tsx
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense><Post params={params} /></Suspense>; // valid: Post is not cached
}
```

## Options

```ts
type Options = [{ checkParams?: boolean; requestApis?: string[] }]; // checkParams default false
```

`checkParams` is off by default. **Unverified:** check in the conformance app whether passing `params` without `await` to a cached function always times out, or whether it depends on `generateStaticParams` providing the values. If it always fails, switch the default to `true`.

## Edge cases

- A promise passed through an intermediate uncached helper that forwards it is an accepted false negative in v0.1.
- A props spread (`<Results {...props} />`) that includes `searchParams` is not reported, because it is not provable.

## False-positive risk

Low with `searchParams`, `cookies()`, and `headers()`. With `params` the result is uncertain, so that case is behind the option.

## Messages

- `promiseArg`: ``` `{{arg}}` is a Promise of request-time data passed to {{scope}} `{{fn}}`. Await it outside and pass the resolved values, or the cache can't fill during prerender and the build times out after 50 seconds. See https://nextjs.org/docs/app/api-reference/directives/use-cache ```

## Tests

- [ ] `searchParams` through JSX and through a call → error.
- [ ] `cookies()` without `await` → error; with `await` → valid.
- [ ] `const c = headers(); <X h={c} />` → error.
- [ ] `params` with `checkParams` false and true.
- [ ] Uncached child → valid.
- [ ] Spread → valid.
