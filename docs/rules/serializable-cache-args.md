# `cache-components/serializable-cache-args`

Disallow arguments to cached functions that cannot be serialized.

**Preset:** `strict` (warn) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

Next.js serializes the arguments of a cached function to build its cache key. Class instances, symbols, `WeakMap`, `WeakSet`, and `URL` instances can't be serialized as arguments. They reach the cached function as temporary references. Next.js 16.4.6 fails the build when the function reads one, for example with "Cannot access description on the server" for a `Symbol`. A `URL` passed this way builds without an error, but its `pathname` is `undefined` inside the cached function.

The rule checks every call and every JSX element in the file that targets a `"use cache"`, `"use cache: remote"`, `"use cache: private"`, or `"use cache: <handler>"` function. It reports an argument or prop that is:

- `new URL()`, `new WeakMap()`, `new WeakSet()`, `new Request()`, `new Response()`, or `new Headers()`.
- `new X()`, where `X` is a class declared in the file or imported.
- `Symbol()` or `Symbol.for()`.
- `this`.
- In a route handler, the request parameter of an exported method, or its `headers`.

`Date`, `Map`, `Set`, arrays, typed arrays, and plain objects are serializable and are not reported. Functions are not reported either: passing one through is allowed, and calling it inside is covered by [`no-introspect-passthrough`](no-introspect-passthrough.md).

## Examples

Invalid:

```tsx
await getPage(new URL(request.url));
await getUser(new UserService(db));
await getLabel(Symbol("theme"));
```

Valid:

```tsx
await getPage(new URL(request.url).pathname);
await getPosts(new Date(), new Map([["sort", "new"]]));
```

## Limitations

- Only expressions written at the call site are checked. A variable that holds a `URL` is not followed.
- Cached functions in other files are not checked.

## Related

- Next.js: [`"use cache"`, Serialization](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`no-promise-args-to-cache`](no-promise-args-to-cache.md)
