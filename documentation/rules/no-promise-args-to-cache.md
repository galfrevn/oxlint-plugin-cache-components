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
   - `cookies()`, `headers()`, or `draftMode()` without `await`, or an identifier bound to one of those calls without `await` (`const c = cookies()`).
   - With `checkParams: true`, also the segment's `searchParams` and `params` (destructured, or as `props.searchParams`) without `await`. The conformance app showed that, on Next.js 16.4.6, passing either one inside a `<Suspense>` boundary does not time out: Next.js postpones the cached component. They are off by default for that reason.
   - An identifier bound to `connection()` is ignored. `no-request-api-in-cache` already covers it when it is used inside the cache.
4. If the argument is wrapped in `await`, or destructured before it is passed, it is valid.
5. A call, without `await`, to a local async function that reads `cookies()`, `headers()`, `connection()`, `draftMode()`, or a `requestApis` entry unconditionally (as in `no-request-api-in-cache`) is also a request promise.
6. **Captured promises** (`capturedPromise`): a variable that a cached function reads from an enclosing function, and that is bound to a request promise, is reported at the read. Next.js serializes captured variables as bound arguments (`test/e2e/app-dir/use-cache-hanging-inputs`, fixture `bound-args`).

## Examples

### Invalid

```ts
import { cookies } from "next/headers";
export default async function Page() {
  return <Prefs store={cookies()} />;        // invalid: if Prefs is "use cache"
}
```

```tsx
import { connection } from "next/server";
async function fetchUncachedData() { await connection(); return Math.random(); }
export default async function Page() {
  const uncachedDataPromise = fetchUncachedData();
  const Foo = async () => { "use cache"; return <p>{await uncachedDataPromise}</p>; }; // invalid: capturedPromise
  return <Foo />;
}
```

```tsx
export default function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Results query={searchParams} />;   // invalid only with checkParams: true
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

`checkParams` is off by default. **Verified** in the conformance app on 2026-11-26 with Next.js 16.4.6: `params` and `searchParams` passed without `await` inside a `<Suspense>` boundary build and render (cases `valid-params-arg` and `valid-search-params-arg`), while `cookies()` without `await` and a captured `connection()` promise fail after about 50 seconds with "A `"use cache"` function took too long during prerendering" (cases `promise-arg-timeout` and `promise-arg-captured`).

## Edge cases

- A promise passed through an intermediate uncached helper that forwards it is an accepted false negative in v0.1.
- A props spread (`<Results {...props} />`) that includes `searchParams` is not reported, because it is not provable.

## False-positive risk

Low with `searchParams`, `cookies()`, and `headers()`. With `params` the result is uncertain, so that case is behind the option.

## Messages

- `promiseArg`: ``` `{{arg}}` is a Promise of request-time data passed to {{scope}} `{{fn}}`. Await it outside and pass the resolved values, or the cache can't fill during prerender and the build times out after 50 seconds. See https://nextjs.org/docs/app/api-reference/directives/use-cache ```

- `capturedPromise`: ``` `{{arg}}` is a Promise of request-time data that {{scope}} function `{{fn}}` captures from the enclosing function. Await it outside and pass the resolved value as an argument, or the cache can't fill during prerender and the build times out after 50 seconds. See https://nextjs.org/docs/app/api-reference/directives/use-cache ```

## Tests

- [ ] `searchParams` through JSX and through a call → valid by default; error with `checkParams: true`.
- [ ] Captured `cookies()` and a captured helper promise → `capturedPromise`; captured awaited value → valid.
- [ ] Unawaited call to a local helper that reads `headers()` → error; a helper that reads it only in a branch → valid.
- [ ] `cookies()` without `await` → error; with `await` → valid.
- [ ] `const c = headers(); <X h={c} />` → error.
- [ ] `params` with `checkParams` false and true.
- [ ] Uncached child → valid.
- [ ] Spread → valid.
