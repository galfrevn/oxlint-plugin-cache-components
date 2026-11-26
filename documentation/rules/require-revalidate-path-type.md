# `cache-components/require-revalidate-path-type`

**v0.1 · recommended: warn · strict: error · type: problem · fix: no · suggestions: yes (2)**

## Summary

Reports `revalidatePath()` called with a **literal dynamic path** (`/blog/[slug]`) and without the second `type` argument. In that case the call **does nothing**.

## Rationale

Next source (`revalidate.ts`):

```
Warning: a dynamic page path "${originalPath}" was passed to "revalidatePath", but the "type" parameter is missing. This has no effect by default, see more info here https://nextjs.org/docs/app/api-reference/functions/revalidatePath
```

It is a silent no-op: the developer or agent thinks the cache was invalidated, but nothing happened. The only trace is a warning in the server console.

## Detection

1. A `CallExpression` to the `revalidatePath` binding from `next/cache` with `arguments.length === 1`.
2. The argument is a string `Literal`, or a `TemplateLiteral` whose static parts (`quasis`) contain a dynamic segment: `[name]`, `[...name]`, or `[[...name]]` (regex `/\[\[?\.{0,3}[^\]/]+\]\]?/`).
3. A concrete path (`/blog/hello`) or a template with expressions (`/blog/${slug}`) → valid: it is a concrete path.

## Examples

```ts
revalidatePath("/blog/[slug]");              // invalid
revalidatePath("/(main)/shop/[...path]");    // invalid
revalidatePath("/blog/[slug]", "page");      // valid
revalidatePath(`/blog/${slug}`);             // valid: concrete path
revalidatePath("/");                         // valid
```

## Fixes and suggestions

`addPageType` adds `"page"` as the second argument (the most common case). `addLayoutType` adds `"layout"`.

## False-positive risk

None. The rule is syntactic and mirrors the condition in Next's source (`isDynamicRoute`).

## Messages

- `missingType`: ``` `revalidatePath("{{path}}")` has no effect: "{{path}}" is a dynamic route, so it needs a `type` ("page" or "layout"). See https://nextjs.org/docs/app/api-reference/functions/revalidatePath ```

## Tests

- [ ] Dynamic literal, catch-all, and optional catch-all → warn.
- [ ] Route group plus dynamic segment → warn.
- [ ] Concrete path and template with an expression → valid.
- [ ] With `type` → valid.
- [ ] Output of both suggestions.
