# `cache-components/require-revalidate-tag-profile`

Require a cache profile as the second argument of `revalidateTag()`.

**Preset:** `recommended` (warn), `strict` (error) · **Type:** suggestion · **Fix:** no · **Suggestions:** yes

## Rule details

`revalidateTag(tag)` with one argument is deprecated. Next.js logs a `console.warn` and treats the call like `revalidateTag(tag, { expire: 0 })`. The one-argument form was the only form before Next.js 16, so code written from older examples often uses it.

TypeScript also flags the call, because the signature requires two arguments. The rule covers JavaScript projects, code behind `as any` or `@ts-ignore`, and agent loops that run lint before the type checker.

## Examples

Invalid:

```ts
import { revalidateTag } from "next/cache";

revalidateTag("posts");
```

Valid:

```ts
import { revalidateTag } from "next/cache";

revalidateTag("posts", "max");
revalidateTag("posts", { expire: 0 });
```

## Suggestions

The rule never fixes automatically, because two of the three suggestions change behavior.

1. Pass `{ expire: 0 }`. This keeps the current behavior.
2. Use `updateTag(tag)`. Offered only when every caller in the file is a Server Action. This is the Next.js recommendation for read-your-own-writes. The suggestion adds `updateTag` to the `next/cache` import when needed.
3. Pass `"max"`. This switches to stale-while-revalidate, the general Next.js recommendation. It changes behavior.

## Options

None.

## Related

- Next.js: [`revalidateTag` with a single argument](https://nextjs.org/docs/messages/revalidate-tag-single-arg)
- Next.js: [`revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
