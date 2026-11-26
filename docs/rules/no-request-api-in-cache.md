# `cache-components/no-request-api-in-cache`

Disallow request-time APIs inside cache scopes.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

A cache scope is a function with `"use cache"`, `"use cache: remote"`, `"use cache: <handler>"`, or `"use cache: private"`, an export of a file that starts with `"use cache"`, or the callback of `unstable_cache()`. Next.js throws when request data is read inside one. On a dynamic route the error appears only under `next start`, so it can pass `next build`.

The rule reports:

| API | `"use cache"`, `remote`, custom | `"use cache: private"` | `unstable_cache()` |
|---|---|---|---|
| `cookies()`, `headers()` | error | allowed | error |
| `searchParams` of a page, read inside a cache scope | error | allowed | error |
| `connection()` | error | error | error |
| `draftMode().enable()`, `draftMode().disable()` | error | error | error |
| `request.headers`, `request.json()`, and other request reads in a Route Handler | error | not reported | error |
| `draftMode().isEnabled` | allowed | allowed | allowed |

It also follows helpers in the same file. When a cached function calls a helper that reads `cookies()`, the rule reports the call site inside the cached function.

APIs are matched by their import from `next/headers` or `next/server`. Renamed imports, namespace imports, and `const` aliases such as `const read = cookies` are recognized. A local variable with the same name is not.

## Examples

Invalid:

```tsx
import { cookies } from "next/headers";

export async function Header() {
  "use cache";
  const theme = (await cookies()).get("theme");
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
  const theme = await getTheme();
  return <header data-theme={theme} />;
}
```

```text
`getTheme()` reads `cookies()` (line 4), and it's called inside "use cache" function `Header`. Read the value outside the cached function and pass it as an argument. See https://nextjs.org/docs/messages/next-request-in-use-cache
```

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await searchParams;
  return <Results q={q} />;
}
```

```ts
import { connection } from "next/server";

export async function getStats() {
  "use cache: private";
  await connection();
}
```

Valid:

```tsx
import { cookies } from "next/headers";

export default async function Page() {
  const theme = (await cookies()).get("theme")?.value;
  return <Header theme={theme} />;
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
  return (await cookies()).get("cart");
}
```

## Options

```json
{
  "cache-components/no-request-api-in-cache": [
    "error",
    { "requestApis": ["next-auth:auth", "currentUser"], "checkTransitive": true }
  ]
}
```

- `requestApis` (`string[]`, default `[]`): functions that read cookies or headers, treated like `cookies()`, from an auth library or your own helpers imported from another file. `"auth"` matches an import named `auth` from any module. `"next-auth:auth"` matches only the `auth` export of `next-auth`. It can also be set once for every rule in `settings["cache-components"].requestApis`. The rule option takes precedence.
- `checkTransitive` (`boolean`, default `true`): follow helpers in the same file.

## Limitations

- The rule analyzes one file at a time. A helper imported from another file is not checked.
- A helper that is passed as a callback, instead of being called, is not followed.
- Through helpers, the rule reports only a request API that always runs once the helper is called: not inside an `if` branch, a ternary, the right side of `&&` or `??`, a loop, a `catch` clause, or a callback, and not after an early `return` or `throw`. A helper that reads `cookies()` only for some arguments is not reported.
- `searchParams` is checked in the default export, `generateMetadata`, and `generateViewport` of `page` files inside an App Router directory, including reads from cached functions declared inside them. Set `settings["cache-components"].appDir` if the app directory is not `app` or `src/app`.

## Related

- Next.js: [Request-time APIs in `"use cache"`](https://nextjs.org/docs/messages/next-request-in-use-cache)
- Next.js: [`"use cache: private"`](https://nextjs.org/docs/app/api-reference/directives/use-cache-private)
- [`no-promise-args-to-cache`](no-promise-args-to-cache.md)
