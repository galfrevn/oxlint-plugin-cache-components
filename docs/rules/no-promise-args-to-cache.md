# `cache-components/no-promise-args-to-cache`

Disallow passing request-time promises to cached functions without `await`.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

A cached function waits for its arguments. When an argument is a promise of request data, such as the `searchParams` prop or `cookies()`, it cannot resolve during the build. Next.js waits 50 seconds and then fails with "Filling a cache during prerender timed out". There is no other message pointing at the cause.

Passing the whole `params` or `searchParams` promise to a child is a documented pattern for uncached children. It is wrong for cached children.

The rule checks every call and every JSX element in the file that targets a `"use cache"`, `"use cache: remote"`, or `"use cache: <handler>"` function. It reports an argument or prop that is:

- The `searchParams` prop of a page, destructured or read as `props.searchParams`, without `await`.
- `cookies()`, `headers()`, or `draftMode()` without `await`, or a variable bound to one of those calls without `await`.
- A call to a function listed in `requestApis`, without `await`.
- The `params` prop of a segment, when `checkParams` is `true`.

## Examples

Invalid:

```tsx
// app/search/page.tsx
export default function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Results query={searchParams} />;
}

async function Results({ query }: { query: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await query;
  return <List items={await search(q)} />;
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

- `checkParams` (`boolean`, default `false`): also report the `params` prop. Whether `params` always times out, or only when `generateStaticParams` does not provide the values, is not settled, so it is off by default.
- `requestApis` (`string[]`, default `[]`): third-party functions that return request data, in the same format as in [`no-request-api-in-cache`](no-request-api-in-cache.md#options). It can also be set once in `settings["cache-components"].requestApis`.

## Limitations

- A promise forwarded through an uncached helper is not followed.
- A props spread, such as `<Results {...props} />`, is not reported.
- Cached functions in other files are not checked.

## Related

- Next.js: [`"use cache"`, Build Hangs (Cache Timeout)](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`no-request-api-in-cache`](no-request-api-in-cache.md)
