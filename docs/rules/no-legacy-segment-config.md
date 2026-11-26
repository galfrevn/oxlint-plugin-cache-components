# `cache-components/no-legacy-segment-config`

Disallow route segment config exports that Next.js rejects when Cache Components is enabled.

**Preset:** `migration` (error) · **Type:** problem · **Fix:** no · **Suggestions:** yes

## Rule details

With `cacheComponents: true`, Next.js fails the build when a page, layout, template, default, or route handler exports `dynamic`, `revalidate`, `fetchCache`, `runtime`, or `experimental_ppr`. Next.js 16.4.6 reports it like this:

```text
Error: Route segment config "revalidate" is not compatible with `nextConfig.cacheComponents`. Please remove it.
```

This rule reports the same exports in the editor, before the build. It checks `export const <name> = ...` and `export { <name> }` of a local constant, in segment files inside the app directory.

A per-file rule can't read `next.config`, so the rule does nothing until you set `cacheComponents: true`. The `migration` preset sets it for you.

Each report says what replaces the export, following the [migration guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components):

| Export | Replacement |
|---|---|
| `dynamic = "force-dynamic"` | Nothing. Routes are dynamic by default. |
| `dynamic = "force-static"` | `"use cache"` on the page or layout. |
| `dynamic = "error"` | `export const ensureStatic = "navigation"` (Next.js 16.4 or later), which fails the build when the route reads uncached or runtime data. |
| `revalidate = N` | `"use cache"` with the closest `cacheLife()` profile, such as `cacheLife("hours")` for `3600`. |
| `revalidate = 0` | Nothing. Routes are dynamic by default. |
| `revalidate = false` | `"use cache"` with `cacheLife("max")`. |
| `fetchCache` | Nothing. `fetch` is not cached by default. |
| `runtime` | Nothing. Cache Components requires the Node.js runtime, even for `runtime = "nodejs"`. |
| `experimental_ppr` | Nothing. Cache Components replaces it. |

The suggestion removes the export. It is offered when the export declares a single constant.

## Examples

Invalid, with `cacheComponents: true`:

```tsx
export const revalidate = 3600;

export default async function Page() {
  return <Posts />;
}
```

```ts
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true });
}
```

Valid:

```tsx
import { cacheLife } from "next/cache";

export default async function Page() {
  "use cache";
  cacheLife("hours");
  return <Posts />;
}
```

## Options

```json
{
  "cache-components/no-legacy-segment-config": ["error", { "cacheComponents": true }]
}
```

- `cacheComponents` (`boolean`, default `false`): set it to `true` when `next.config` enables `cacheComponents`. While it is `false`, the rule reports nothing.
- `appDir` (`string[]`): the app directories, as in `settings["cache-components"].appDir`.

## When not to use it

Before you enable `cacheComponents`, these exports are valid. Turn the rule on together with the flag.

## Related

- Next.js: [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components)
- Next.js: [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
