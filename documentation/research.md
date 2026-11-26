# Research

All findings were checked between 2026-11-25 and 2026-11-26, unless marked **Unverified**. When Next.js docs and source disagree, the code in the `canary` branch of `vercel/next.js` wins.

## 1. oxlint: JS plugins

Sources:
- https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html
- https://oxc.rs/docs/guide/usage/linter/js-plugins.html
- https://oxc.rs/docs/guide/usage/linter/cli.html
- Code: `crates/oxc_linter/src/config/plugins.rs` and `apps/oxlint/src-js/plugins/load.ts` in `oxc-project/oxc`.

| Topic | Finding |
|---|---|
| Status | "JS plugins are currently in **alpha**, and remain under active development." Behavior is meant to be identical to ESLint's; any difference is an oxlint bug. |
| Current version | `oxlint` 1.95.0 and `@oxlint/plugins` 1.95.0, published 2026-11-23. oxlint requires Node `^20.19.0 \|\| >=22.12.0`. `@oxlint/plugins` has no dependencies, is about 207 KB, and ships ESM and CJS. |
| API | There are two forms: `create` (ESLint) and the alternative `createOnce`, which is called once and uses per-file `before` and `after` hooks. The plugin is wrapped with `eslintCompatPlugin(...)` from `@oxlint/plugins`, which adds `create` delegating to `createOnce`, so the same plugin runs in ESLint. `@oxlint/plugins` goes in as a runtime dependency. |
| `defineRule` | Exported from `@oxlint/plugins` along with the `ESTree` types (used in practice by `dmmulroy/anti-slop`). |
| `before` hook | The `before` hook is not guaranteed to run on every file. oxlint plans to skip rules whose nodes of interest do not appear in the AST. If something must always run, use the `Program` visitor. If `before` returns `false`, the whole file is skipped, including `after`. |
| Performance | `createOnce` is not faster than `create` today, but the team plans to send only pointers to the relevant nodes from Rust. |
| Supported API | AST traversal, `node.parent`, `sourceCode.getAncestors`, fixes, rule options, selectors, `SourceCode` and token APIs, scope analysis, code path analysis (CFG), `// oxlint-disable` directives, the language server, and suggestions in the IDE. |
| Not supported | Custom parsers and formats (Vue, Svelte, Angular) and type-aware rules from JS plugins. oxlint's native type-aware support (tsgolint or tsrs) is only for native rules. |
| Tests | `RuleTester` from `oxlint/plugins-dev`, based on ESLint's. Vitest's `describe` and `it` are assigned to it. Parser option: `languageOptions.parserOptions.lang = "ts"` (and `"tsx"` for JSX, **Unverified**). |
| Configuration | `jsPlugins: ["specifier"]` in `.oxlintrc.json` or `oxlint.config.ts` (`defineConfig` from `oxlint`). Paths resolve relative to the config file. An alias is accepted: `{ "name": "x", "specifier": "..." }`. `oxlint.config.ts` requires Node 22.18 or later. |
| Shared configs | Used with `extends: [preset]` in `oxlint.config.ts`. Real-world pattern (`@nkzw/oxlint-config`): the preset exports `jsPlugins: [{ name, specifier: import.meta.resolve('...') }]` and `rules`. |
| Name and prefix | The plugin name is taken, in this order, from the config alias, `meta.name`, or `name` in `package.json`, and then normalized. `oxlint-plugin-foo` becomes `foo`; `@scope/oxlint-plugin-foo` becomes `@scope/foo`. Duplicate names are rejected. `nextjs`, `react`, `jsdoc`, etc. are reserved by native plugins. |
| CLI | `--format`: `default`, `agent`, `github`, `gitlab`, `json`, `junit`, `sarif`, `stylish`, `unix`, `checkstyle`. Fixes: `--fix`, `--fix-suggestions`, `--fix-dangerously`. Also `--quiet`, `--deny-warnings`, `--max-warnings`, `-c/--config`, and `--type-aware`. |
| Adoption | oxlint passed 50M weekly downloads and added 10M in three weeks (**Secondary source**: a post on X, 2026-11-18). tsrs, the Rust port of TypeScript that is now part of oxc, reached 5M weekly downloads in 23 days. |

**Unverified:**
- Whether `context.settings` reaches JS plugins (needed for global options).
- Whether `.oxlintrc.json` can `extends` an npm package or only file paths.
- The exact way oxc serializes directives in ESTree (an `ExpressionStatement` with a `directive` property is expected).
- Whether a `WeakMap` keyed by `sourceCode.ast` can share analysis between rules in the same file.

## 2. Trend: deterministic and anti-slop rules on oxlint

| Source | Date | Finding |
|---|---|---|
| github.com/dmmulroy/anti-slop | Created 2026-08-12; 6,450 stars as of 2026-11-26 | "Opinionated Oxlint rules for rejecting low-evidence TypeScript and JavaScript patterns". Vendored with a skill (`npx skills add dmmulroy/anti-slop --skill install-anti-slop`) instead of published to npm. Pins `@oxlint/plugins` and `oxlint` to the same exact version. Its README now recommends `cloudflare/oxlint-config`. |
| x.com/cnakazawa/status/2122974414098821174 | 2026-11-18 | "Shipped @nkzw/oxlint 3.0: Optimized for reducing agent mistakes in JS". Adopted the anti-slop rules, renamed as `quality`. |
| x.com/dok2001/status/2123697396508954893 (Dane Knecht, CTO of Cloudflare) | 2026-11-20 | "@cloudflare/oxlint-config is on npm… Inspired by @dillon_mulroy's anti-slop rules and built on @cnakazawa's nkzw config. Type-aware checks run on the new tsrs beta." |
| github.com/cloudflare/oxlint-config | Created 2026-11-19; 213 stars | Config with `extends`, presets for standalone oxlint and for Vite+, and a `migrate-oxlint-config` skill. |
| github.com/K-Mistele/anti-slop and x.com/0xblacklight/status/2122164674309521562 | 2026-11-16 | Fork with semantic rules evaluated by an LLM over changed code ("jev rules"). It shows demand for non-deterministic rules too. This project stays with deterministic rules. |
| x.com/wquguru/status/2121562681069211693 (post on X's web rewrite) | 2026-11-14 | **Secondary source**: X used custom oxlint plugins, including an anti-slop one, and tsrs in pre-commit so that bad AI-generated code does not pass even the local commit. **Unverified**: check a primary source before citing it publicly. |
| github.com/evilmartians/design-lint | 2026-09 | "Design-token lint rules… for Oxlint and ESLint". Same dual-target pattern as this project. |
| npm `@shadcn/lint` 0.2.5 | 2026-11-02 | "A programmable agent-first linter for Tailwind design systems". Keywords: oxlint, eslint. shadcn (Vercel) is betting on agent-first linters. |

Conclusion: the approach of deterministic rules that catch agent mistakes on oxlint has precedent from Cloudflare, VoidZero, and shadcn. No one has done it for Next.js yet.

## 3. The gap in Next.js

- `packages/eslint-plugin-next/src/rules` in `vercel/next.js@canary`: 22 rules, none about `use cache`, Cache Components, server actions, or revalidation (2026-11-26).
- `crates/oxc_linter/src/rules/nextjs` in `oxc-project/oxc`: 21 rules, a port of the previous ones, and none about caching (2026-11-26).
- npm search ("use cache lint", "cache components eslint", "nextjs use cache oxlint", "next cache lint rules"): no community plugin (2026-11-26).
- A community `use cache` debugger exists (dev.to/shubhradev). It works at runtime, not as a lint rule.

## 4. Next.js: verified semantics (Next 16.4, docs and code)

Primary code sources: `packages/next/src/server/use-cache/use-cache-messages.ts` (factories that create the cache and revalidation errors) and `packages/next/src/server/web/spec-extension/revalidate.ts`. These are the source of truth for the rule catalog.

| API | Verified fact | Source |
|---|---|---|
| `use cache` | Async functions or components. At file level, every export becomes cached. Arguments and return values must be serializable, and argument serialization is stricter. Class instances, functions (except pass-through), Symbols, WeakMap, WeakSet, and URL are not supported. Non-serializable values can be accepted "as long as you don't introspect them". | nextjs.org/docs/app/api-reference/directives/use-cache |
| Request-time APIs | `cookies()`, `headers()`, and `searchParams` cannot be used, "and the restriction follows the call stack". "On a dynamically rendered route… it can pass `next build` and fail under `next start`." | Same as above |
| Build hang | Runtime data promises created outside the boundary (params, searchParams, cookies()) make the build wait and time out after 50 seconds: "Filling a cache during prerender timed out…". | Same as above |
| `React.cache` | Runs in an isolated scope inside `use cache`: values stored outside are not visible inside, and two Cache Functions do not share results. | Same as above, plus the migration guide |
| Draft mode | `draftMode().isEnabled` can be read inside. Calling `enable()` or `disable()` inside throws. | Docs and `createDraftModeMutationInUseCacheError` |
| `use cache: remote` | Shares the cache across users and instances. Cannot read cookies or headers directly. Remote cannot be nested inside private, and private cannot be inside remote. The docs recommend not caching per-user data. | nextjs.org/docs/app/api-reference/directives/use-cache-remote |
| `use cache: private` | Allows `cookies()`, `headers()`, and `searchParams`. The result is not stored in the server cache across requests. Does not support custom cache handlers. | nextjs.org/docs/app/api-reference/directives/use-cache-private |
| `connection()` | **Docs inconsistency:** the `connection` page says that inside `use cache` it "resolves immediately", but the `use cache: private` page says it is prohibited in both. The code throws in `cache`, `private-cache`, and `unstable-cache` (`server/request/connection.ts`). The code wins. | Canary code |
| Private composition | `use cache: private` inside `use cache`, inside `unstable_cache()`, or in build contexts (`generateStaticParams`) throws. | `use-cache-messages.ts` |
| `cacheLife` | Only inside `use cache` or `use cache: private`. At module level it throws. It can be called conditionally, but only once per execution. Profiles: default 5m/15m/never, seconds 30s/1s/1m, minutes 5m/1m/1h, hours 5m/1h/1d, days 5m/1d/1w, weeks 5m/1w/30d, max 5m/30d/1y (stale/revalidate/expire). | nextjs.org/docs/app/api-reference/functions/cacheLife |
| Short nested cache | Short when `revalidate: 0` or `expire` is under 5 min. Among the presets, only `seconds` qualifies. If nested inside a `use cache` without an explicit `cacheLife`, it fails during prerender. | cacheLife docs and `createNestedCache*Error` |
| `cacheTag` | Only inside `use cache` or private. Maximum 256 characters per tag and 128 tags per call. Anything over the limit is dropped with a console warning. The docs say nothing about cardinality. | cacheTag docs and `createCacheTagOutsideUseCacheError` |
| `revalidateTag` | Signature `revalidateTag(tag, profile)`. **The single-argument form is deprecated** and behaves like `{ expire: 0 }`. The code emits `console.warn('"revalidateTag" without the second argument is now deprecated, add second argument of "max" or use "updateTag"…')`. Only in Server Functions and Route Handlers; not in Client Components or Proxy. | Docs and `revalidate.ts` |
| `revalidatePath` | With a dynamic route (`/blog/[slug]`) and no `type`: `console.warn('…the "type" parameter is missing. This has no effect by default…')`. If the path exceeds the maximum length, it warns and returns. | `revalidate.ts` |
| Invalidation contexts | `revalidateTag`, `revalidatePath`, and `updateTag` throw inside cached functions (cache, private, unstable), during render, and inside `generateStaticParams` (and `unstable_generateParamMatching`). | `revalidate.ts` and `use-cache-messages.ts` |
| `updateTag` | Only in Server Actions. In Route Handlers it throws: "updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead." | Docs and `revalidate.ts` |
| `refresh` | Only in Server Actions (`phase === 'action'`, not in `/route`). It does not invalidate server-cached data. It only refreshes client-side dynamic data. | Docs and `revalidate.ts` |
| Route segment config | With `cacheComponents` enabled, exporting `dynamic`, `revalidate`, or `fetchCache` throws. `runtime` must be removed. `experimental_ppr` was removed in Next 16. | nextjs.org/docs/app/guides/migrating-to-cache-components |
| `unstable_cache` | Still works and persists across deploys, which `use cache` does not do. Migrating is optional. It should not be flagged as an error. | Same as above |
| Server Actions | "it is reachable via a direct POST request… verify authentication and authorization inside each one." | nextjs.org/docs/app/guides/data-security |

"Learn more" URLs that Next itself uses (reused in our messages):
- `https://nextjs.org/docs/messages/next-request-in-use-cache`
- `https://nextjs.org/docs/messages/cache-tag-outside-use-cache`
- `https://nextjs.org/docs/messages/cache-life-outside-use-cache`
- `https://nextjs.org/docs/messages/use-cache-private-composition`
- `https://nextjs.org/docs/messages/revalidate-in-use-cache`
- `https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`
- `https://nextjs.org/docs/messages/revalidate-tag-single-arg`
- `https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
- `https://nextjs.org/docs/app/api-reference/directives/use-cache-private`

**Unverified:**
- Whether custom directives (`'use cache: <handler>'`, defined in `cacheHandlers`) behave like the public `use cache`.
- Whether async arrow functions with `'use cache'` in the body are supported.
- Whether `draftMode().enable()` inside `use cache: private` also fails.
- The exact error thrown when introspecting `children` or calling a function passed as an argument.
- Whether passing `params` without `await` to a cached function always causes a timeout, or depends on `generateStaticParams`.

## 5. The RCE advisory of 2026-10-14

- GHSA-673q-mjm6-r5xr, "Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays". Critical severity (9.5). Affects Next >=16.0.0 and <=16.4.0, fixed in 16.4.1. Published by eps1lon on 2026-10-14.
- It was a framework serialization bug. The only mitigation is updating. A lint rule does not prevent it.
- The advisory is not used as a marketing hook. The README may recommend keeping Next.js up to date.

## 6. Corpus

- 193 unique repositories found on 2026-11-26 with `gh search code` over: `"use cache" cacheLife`, `"use cache" cacheTag`, `"use cache: private"`, `"use cache: remote"`, `cacheComponents: true` in `next.config.{ts,mjs}`, `"use cache" updateTag`, and `"use cache" revalidateTag`. Forks and archived repositories are excluded.
- `vercel/shop` was added: the official Vercel Shop template (GA on 2026-10-19), which uses `use cache` in `lib/*/server.ts`.
- `vercel/next.js` is marked `fixtures-only`. Its tests use invalid patterns on purpose, so it cannot measure false positives. It is a source of invalid cases: `test/e2e/app-dir/cache-components-errors`, `cache-components-request-apis`, `cache-components-route-handler-errors`, `cache-components-segment-configs`, `use-cache-*`, and `test/development/app-dir/use-cache-errors`. Next is MIT-licensed, so fixtures can be derived with attribution.
- The most-starred repositories are cloudflare/vinext (9.4k), pqoqubbw/icons (8.3k), cursor/community-plugins (4.0k), kokonut-labs/kokonutui (2.4k), alchemy-run/alchemy (2.1k), CaliCastle/cali.so (2.0k), wotschofsky/domain-digger (1.6k), sanity-io/next-sanity (955), and opennextjs/opennextjs-netlify (853).
- The full list is in `corpus.tsv`.
