# `cache-components/require-revalidate-tag-profile`

**v0.1 · recommended: warn · strict: error · type: suggestion · fix: no · suggestions: yes (3)**

## Summary

Reports `revalidateTag(tag)` called with a single argument.

## Rationale

- Next source: `console.warn('"revalidateTag" without the second argument is now deprecated, add second argument of "max" or use "updateTag". See more info here: https://nextjs.org/docs/messages/revalidate-tag-single-arg')`.
- Docs: "No second argument (deprecated): Behaves like `{ expire: 0 }`… may be removed in a future version."
- The TypeScript signature requires two arguments, so a TypeScript project sees the call as a type error. The rule's value is in JavaScript projects, in code with `// @ts-ignore` or `as any`, and in the agent loop, which often runs lint before typecheck.
- It is the canonical example of "old agent code": the one-argument API was the only one until Next 15.

## Detection

`CallExpression` to the `revalidateTag` binding from `next/cache` with `arguments.length === 1` and no `SpreadElement`.

## Examples

```ts
revalidateTag("posts");                  // invalid
revalidateTag("posts", "max");           // valid
revalidateTag("posts", { expire: 0 });   // valid
revalidateTag(...args);                  // valid: cannot be determined
```

## Fixes and suggestions

Never autofix: two of the three suggestions change the semantics.

1. `keepBehavior`: `revalidateTag(tag, { expire: 0 })`. It is identical to the current behavior.
2. `useUpdateTag` (only when the effective context is `server-action`): `updateTag(tag)`, with the import. This is Next's recommendation for "read-your-own-writes".
3. `useMax`: `revalidateTag(tag, "max")`. This is stale-while-revalidate, which is Next's general recommendation. **It changes the semantics.**

## False-positive risk

None. The rule is syntactic.

## Messages

- `singleArg`: ``` `revalidateTag()` without a second argument is deprecated and behaves like `{ expire: 0 }`. Pass a profile ("max" for stale-while-revalidate) or use `updateTag()` in Server Actions. See https://nextjs.org/docs/messages/revalidate-tag-single-arg ```
- Suggestions: ``` Pass { expire: 0 } (same behavior) ```, ``` Use updateTag() (Server Action) ```, ``` Pass "max" (stale-while-revalidate) ```

## Tests

- [ ] One argument → warn with 2 suggestions outside an action and 3 inside one.
- [ ] Two arguments → valid.
- [ ] Spread → valid.
- [ ] Import alias → detected.
- [ ] Output of each suggestion, including the `updateTag` import.
