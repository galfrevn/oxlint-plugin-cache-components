# `cache-components/no-promise-args-to-cache`

Disallow passing request-time promises to cached functions without `await`.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

A cached function waits for its arguments. When an argument is a promise of request data, such as `cookies()`, it cannot resolve during the build. Next.js 16.4.6 waits about 50 seconds and then fails with "A `"use cache"` function took too long during prerendering". The message names `params` and `searchParams` as common causes, but does not point at the argument.

The conformance app confirmed the timeout for `cookies()` and for a captured promise that waits for `connection()`. Passing the `searchParams` or `params` promise inside a `<Suspense>` boundary did not time out, because Next.js postpones the cached component, so those props are reported only with `checkParams`.

The rule checks every call and every JSX element in the file that targets a `"use cache"`, `"use cache: remote"`, or `"use cache: <handler>"` function. It reports an argument or prop that is:

- `cookies()`, `headers()`, or `draftMode()` without `await`, or a variable bound to one of those calls without `await`.
- A call to a function listed in `requestApis`, without `await`.
- A call, without `await`, to an async function in the same file that always reads `cookies()`, `headers()`, `connection()`, or `draftMode()`.
- A variable bound to one of those promises that a cached function declared inside the caller uses. Next.js passes captured variables to the cached function like arguments.
- The `searchParams` and `params` props of a segment, destructured or read as `props.searchParams`, when `checkParams` is `true`.

## Examples

Invalid:

```tsx
import { connection } from "next/server";

async function fetchUncachedData() {
  await connection();
  return Math.random();
}

export default async function Page() {
  const uncachedDataPromise = fetchUncachedData();
  const Foo = async () => {
    "use cache";
    return <p>{await uncachedDataPromise}</p>;
  };
  return <Foo />;
}
```

```tsx
import { cookies } from "next/headers";

export default async function Page() {
  return <Prefs store={cookies()} />;
}
```

Valid:

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Results q={q} />;
}
```

```tsx
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense>
      <Post params={params} />
    </Suspense>
  );
}
```

## Options

```json
{
  "cache-components/no-promise-args-to-cache": [
    "error",
    { "checkParams": false, "requestApis": ["next-auth:auth"] }
  ]
}
```

- `checkParams` (`boolean`, default `false`): also report the `searchParams` and `params` props. On Next.js 16.4.6 they did not time out inside a `<Suspense>` boundary, so they are off by default. Turn the option on to keep cached functions free of request promises as a convention.
- `requestApis` (`string[]`, default `[]`): functions that return request data, from an auth library or your own helpers imported from another file, in the same format as in [`no-request-api-in-cache`](no-request-api-in-cache.md#options). It can also be set once in `settings["cache-components"].requestApis`.

## Limitations

- A promise forwarded through an uncached helper is not followed.
- A props spread, such as `<Results {...props} />`, is not reported.
- Cached functions in other files are not checked.

## Related

- Next.js: [`"use cache"`, Build Hangs (Cache Timeout)](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`no-request-api-in-cache`](no-request-api-in-cache.md)
