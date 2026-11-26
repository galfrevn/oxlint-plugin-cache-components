# `cache-components/require-revalidate-path-type`

Require the `type` argument when `revalidatePath()` receives a dynamic route.

**Preset:** `recommended` (warn), `strict` (error) · **Type:** problem · **Fix:** no · **Suggestions:** yes

## Rule details

`revalidatePath("/blog/[slug]")` without a second argument does nothing. Next.js only logs a warning in the server console:

```text
Warning: a dynamic page path "/blog/[slug]" was passed to "revalidatePath", but the "type" parameter is missing. This has no effect by default
```

The rule reports a string literal or template literal whose static text contains a dynamic segment: `[slug]`, `[...slug]`, or `[[...slug]]`. It uses the same test as Next.js (`isDynamicRoute` in strict mode), so a segment such as `post-[id]` is not dynamic. A template literal with expressions, such as `` `/blog/${slug}` ``, is a concrete path and is valid.

## Examples

Invalid:

```ts
import { revalidatePath } from "next/cache";

revalidatePath("/blog/[slug]");
revalidatePath("/(main)/shop/[...path]");
```

Valid:

```ts
import { revalidatePath } from "next/cache";

revalidatePath("/blog/[slug]", "page");
revalidatePath(`/blog/${slug}`);
revalidatePath("/");
```

## Suggestions

- Add `"page"` as the type, which revalidates the page.
- Add `"layout"` as the type, which revalidates the layout and every page below it.

## Options

None.

## Related

- Next.js: [`revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
