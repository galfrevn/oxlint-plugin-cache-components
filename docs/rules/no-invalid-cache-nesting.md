# `cache-components/no-invalid-cache-nesting`

Disallow cache directive combinations that Next.js rejects.

**Preset:** `recommended` (error), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

`"use cache: private"` reads request data, so its result cannot be stored in a shared cache. Next.js throws when a private function runs inside a public cache, inside `unstable_cache()`, or in a build-time context such as `generateStaticParams`.

| Outer \ Inner | public | remote | private |
|---|---|---|---|
| `"use cache"`, `"use cache: <handler>"` | allowed | allowed | error |
| `"use cache: remote"` | allowed | allowed | error |
| `"use cache: private"` | allowed | `checkRemoteInPrivate` | allowed |
| `unstable_cache()` callback | allowed | allowed | error |
| `generateStaticParams`, `unstable_generateParamMatching` | allowed | allowed | error |

The rule follows calls and JSX in the same file, including calls through helpers without a directive. It reports the call site inside the outer function.

## Examples

Invalid:

```tsx
async function Recommendations() {
  "use cache: private";
  const user = (await cookies()).get("uid");
  return <List items={await recommend(user)} />;
}

export default async function Page() {
  "use cache";
  return <Recommendations />;
}
```

```ts
import { unstable_cache } from "next/cache";

async function getPrefs() {
  "use cache: private";
  return loadPrefs();
}

export const getHome = unstable_cache(async () => ({ prefs: await getPrefs() }));
```

```ts
async function getUserLocale() {
  "use cache: private";
  return readLocale();
}

export async function generateStaticParams() {
  const locale = await getUserLocale();
  return [{ locale }];
}
```

Valid:

```tsx
export default async function Page() {
  return (
    <>
      <CachedShell />
      <Suspense>
        <Recommendations />
      </Suspense>
    </>
  );
}
```

## Options

```json
{
  "cache-components/no-invalid-cache-nesting": ["error", { "checkRemoteInPrivate": false }]
}
```

- `checkRemoteInPrivate` (`boolean`, default `false`): also report a `"use cache: remote"` function inside a `"use cache: private"` function. The `"use cache: remote"` docs list this combination as invalid, but no matching error was found in the Next.js source, so it is off by default.

## Related

- Next.js: [`"use cache: private"` composition](https://nextjs.org/docs/messages/use-cache-private-composition)
- Next.js: [`"use cache: remote"`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)
