# Specification

## Pitch

> Next.js has 22 lint rules. None of them cover Cache Components.
> `oxlint-plugin-cache-components` turns the runtime errors of `"use cache"`, `cacheLife`, `cacheTag`, `updateTag` and `revalidateTag` into lint errors, so you (and your coding agent) catch them in the editor instead of in `next start`.

## Problem

Cache Components (Next.js 16, flag `cacheComponents`) introduced an explicit caching model with strict rules. Next validates most of them at runtime:

- Reading `cookies()`, `headers()`, or `searchParams` inside `use cache` throws an error. On a dynamic route, it passes `next build` and fails in `next start` (`use cache` docs, Request-time APIs section).
- Calling `cacheTag()` or `cacheLife()` outside a cache scope throws an error.
- A short-lived nested cache, inside another cache without an explicit `cacheLife`, fails during prerender.
- Calling `updateTag()` or `refresh()` outside a Server Action throws an error.
- `revalidateTag(tag)` with a single argument is deprecated and only emits a `console.warn`.
- `revalidatePath('/blog/[slug]')` without `type` does nothing, and it also only warns in the console.

No static tool detects this today. `eslint-plugin-next` has 22 rules, all from the Pages Router era and about `<head>`, fonts, and scripts. oxlint's native `nextjs` plugin replicates 21 of those rules (**Verified**, 2026-11-26).

## Why now

1. Agents write this code wrong. The hypothesis is to be tested with an eval (see `spec.md`): most Next.js code that models were trained on predates Cache Components. Examples are cached `fetch` by default, `export const revalidate`, single-argument `revalidateTag`, and `unstable_cache`. A runtime error that appears only in `next start` is invisible to an agent that edits code without running the app.
2. oxlint is today the vehicle for deterministic rules aimed at agents. In November 2026 a wave of "anti-slop" configs appeared on oxlint: `dmmulroy/anti-slop` (6,450 stars), `@nkzw/oxlint-config` 3.0 ("Optimized for reducing agent mistakes in JS"), and `@cloudflare/oxlint-config`, announced by Cloudflare's CTO. oxlint already has an `--format agent` output format. Details and sources are in `research.md`.
3. The gap is total and verifiable. No community rule plugin for `use cache` exists on npm (searched 2026-11-26).

## Goals

1. **Product:** an oxlint-first plugin with 9 rules in v0.1. Each rule is based on a real Next.js error or warning, with under 5% false positives on a corpus of real repositories.
2. **Ecosystem:** the Cache Components rule set for oxlint JS plugins, with a possible port of rules to oxlint's native `nextjs` plugin (Rust).
3. **Foundation for cachegraph (v2):** the analysis utilities (directives, contexts, call graph) are phase 1 of cross-file analysis.

## Non-goals (v0.1)

- Not a security tool. The RCE advisory of 2026-10-14 (GHSA-673q-mjm6-r5xr) was a framework bug, and no rule prevents it. The project does not present it that way. See `roadmap.md`.
- No cross-file analysis. A helper imported from another file that reads `cookies()` is not detected.
- No type information. oxlint JS plugins do not support type-aware rules.
- Does not replace Next.js validation in dev or the dev overlay. It complements them by catching problems before code runs.
- No style opinions, for example "prefer `use cache` over `unstable_cache`". `unstable_cache` is still supported and has legitimate uses, such as persisting across deploys.
- No Pages Router support.

## Success metrics (90 days after launch)

| Metric | Target |
|---|---|
| False positives on the corpus (`recommended` rules) | < 5% per rule |
| Real bugs found in public repositories and confirmed by their maintainers | ≥ 5 |
| Rules accepted upstream (eslint-plugin-next, native oxlint, or Next.js docs) | ≥ 1 |
| Weekly npm downloads | 1,000 (indicative) |

## Product spec

### Scope of v0.1

Nine rules. Each rule's details are in `rules/`.

| # | Rule | Group | `recommended` | `strict` |
|---|---|---|---|---|
| A1 | `no-request-api-in-cache` | Runtime error | error | error |
| A2 | `no-cache-api-outside-cache` | Runtime error | error | error |
| A3 | `require-cachelife-when-nested` | Prerender error | error | error |
| A4 | `no-invalid-cache-nesting` | Runtime error | error | error |
| A5 | `valid-invalidation-context` | Runtime error | error | error |
| A6 | `no-promise-args-to-cache` | Build timeout | error | error |
| B1 | `require-revalidate-tag-profile` | Deprecation | warn | error |
| B2 | `require-revalidate-path-type` | Silent no-op | warn | error |
| C1 | `require-auth-before-revalidate` | Security heuristic | warn | error |

Planned for v0.2: `no-legacy-segment-config` (preset `migration`), `no-introspect-passthrough`, `serializable-cache-args`, and `no-react-cache-across-boundary` (the last three in `strict`, as warn).

### Installation (target developer experience)

Public text is in English.

```bash
pnpm add -D oxlint oxlint-plugin-cache-components
```

#### `oxlint.config.ts`, with preset (recommended)

```ts
import { defineConfig } from "oxlint";
import cacheComponents from "oxlint-plugin-cache-components/configs";

export default defineConfig({
  extends: [cacheComponents.recommended],
});
```

The preset ships its own `jsPlugins: [{ name: "cache-components", specifier: import.meta.resolve("oxlint-plugin-cache-components") }]` and its `rules`, the same way `@nkzw/oxlint-config` does.

#### `.oxlintrc.json`, manual

```jsonc
{
  "jsPlugins": ["oxlint-plugin-cache-components"],
  "rules": {
    "cache-components/no-request-api-in-cache": "error",
    "cache-components/no-cache-api-outside-cache": "error",
    "cache-components/require-cachelife-when-nested": "error",
    "cache-components/no-invalid-cache-nesting": "error",
    "cache-components/valid-invalidation-context": "error",
    "cache-components/no-promise-args-to-cache": "error",
    "cache-components/require-revalidate-tag-profile": "warn",
    "cache-components/require-revalidate-path-type": "warn",
    "cache-components/require-auth-before-revalidate": "warn"
  }
}
```

#### ESLint (secondary, best effort)

```js
// eslint.config.js
import cacheComponents from "oxlint-plugin-cache-components";
export default [cacheComponents.configs["flat/recommended"]];
```

A smoke test in CI guarantees this, not the full suite (ADR-002).

### Message format

Messages are the product. Humans read them in the editor, and agents read them in their loop. Rules:

1. **Structure:** `<what is wrong and in which scope>. <why, only if not obvious>. <what to do>. See <URL>`. This is the same convention as Next.js's message file: "State the scope and constraint, explain non-obvious boundaries, give the immediate fix, then link to the relevant docs."
2. **If the error is the same one Next throws, the text is too.** It helps the agent connect the lint error with the runtime error, and the reverse. Attribution goes in `NOTICE` and in the README ("Messages adapted from Next.js, MIT License").
3. **Always include a URL**, preferably `nextjs.org/docs/messages/*`.
4. **Concrete names:** the name of the cached function, the helper, and the line where the API is read.
5. **English, no emoji, no heavy Markdown.** Backticks for identifiers.
6. **Autofix:** if a mechanical fix exists, put it in `suggest`. Never use an automatic `fix` when the change alters semantics. Use `fix` only when the change preserves the exact behavior.

Example (A1, transitive):

```text
`getTheme()` reads `cookies()` (line 4), and it's called inside "use cache" function `Header`. Read the value outside the cached function and pass it as an argument. See https://nextjs.org/docs/messages/next-request-in-use-cache
```

### Severities and presets

- `recommended`: everything that breaks at runtime or build is `error`. Deprecations, no-ops, and heuristics are `warn`.
- `strict`: everything is `error`, plus the v0.2 heuristic rules as `warn`.
- `migration` (planned for v0.2): `no-legacy-segment-config` as `error`. It is for projects that enable `cacheComponents`.
- `all`: every rule as `error`. For development and the corpus only.

### Global options

In v0.1 these options are set per rule, because it is **Unverified** whether `context.settings` reaches JS plugins (see `research.md`). If confirmed, they are added as `settings["cache-components"]`, and per-rule options take precedence.

| Option | Rules | Default | Purpose |
|---|---|---|---|
| `requestApis: string[]` | A1, A6 | `[]` | Third-party functions that read cookies or headers and should be treated as request APIs: `auth` (Auth.js), `currentUser` (Clerk), etc. Format: `"auth"` or `"next-auth:auth"` (module:export). |
| `shortProfiles: string[]` | A3 | `["seconds"]` | Custom `cacheLife` profiles whose `expire` is under 5 minutes or whose `revalidate` is 0. |
| `authFunctions: string[]` | C1 | see rule | Functions whose call counts as an auth check. |
| `authWrappers: string[]` | C1 | see rule | Higher-order functions that wrap the action with auth (`withAuth`, `authActionClient.action`). |
| `appDir: string[]` | A5, C1 | `["app", "src/app"]` | App Router roots, used to recognize `route.ts`, `page.tsx`, etc. |

### Product non-goals

- No custom CLI. Use `oxlint`.
- No custom language server. oxlint already exposes the LSP with suggestions.
- No style rules and no opinions about `unstable_cache`.
- No support for Pages Router, Vue, or Svelte.

## Rule catalog

Principle ([ADR-006](decisions.md#adr-006-nextjs-errors-as-the-source-of-truth-for-the-catalog)): **every rule in `recommended` maps to an error or warning that Next.js already emits.** The rule only moves that diagnostic from runtime to the editor. Heuristics ship as `warn`, or in `strict`.

Source of truth: `packages/next/src/server/use-cache/use-cache-messages.ts` and `packages/next/src/server/web/spec-extension/revalidate.ts` in `vercel/next.js@canary`, read on 2026-11-26.

### v0.1

| Rule | What Next does today | Next error or warning | Doc | Preset |
|---|---|---|---|---|
| [`no-request-api-in-cache`](rules/no-request-api-in-cache.md) | Throws at runtime. On dynamic routes, it appears only at `next start`. | `createCookiesInUseCacheError`, `createHeadersInUseCacheError`, `createSearchParamsInUseCacheError`, `createConnectionIn{Public,Private}UseCacheError`, `createRouteHandlerRequestInUseCacheError`, `createDraftModeMutationInUseCacheError`, and their equivalents for `unstable_cache` | next-request-in-use-cache | rec: error |
| [`no-cache-api-outside-cache`](rules/no-cache-api-outside-cache.md) | Throws at runtime. | `createCacheTagOutsideUseCacheError`, `createCacheLifeOutsideUseCacheError` | cache-tag-outside-use-cache, cache-life-outside-use-cache | rec: error |
| [`require-cachelife-when-nested`](rules/require-cachelife-when-nested.md) | Fails during prerender. | `createNestedCacheZeroRevalidateError`, `createNestedCacheShortExpireError` | nested-use-cache-no-explicit-cachelife | rec: error |
| [`no-invalid-cache-nesting`](rules/no-invalid-cache-nesting.md) | Throws at runtime (private inside public or `unstable_cache`, or at build time), plus the nesting table in the `use cache: remote` docs. | `createUseCachePrivateInsidePublicUseCacheError`, `createUseCachePrivateInsideUnstableCacheError`, `createUseCachePrivateOutsideRequestContextError`, and the `use cache: remote` nesting table | use-cache-private-composition | rec: error |
| [`valid-invalidation-context`](rules/valid-invalidation-context.md) | Throws at runtime. | `createRevalidateInCachedFunctionError`, `createRevalidateDuringRenderError`, `createRevalidateInBuildTimeGeneratorError`, and the `updateTag` and `refresh` errors outside a Server Action | revalidate-in-use-cache | rec: error |
| [`no-promise-args-to-cache`](rules/no-promise-args-to-cache.md) | The build hangs and aborts after 50 s. | "Filling a cache during prerender timed out…" | use-cache (Build Hangs) | rec: error |
| [`require-revalidate-tag-profile`](rules/require-revalidate-tag-profile.md) | `console.warn` deprecation. Behaves like `{ expire: 0 }`. | `"revalidateTag" without the second argument is now deprecated…` | revalidate-tag-single-arg | rec: warn |
| [`require-revalidate-path-type`](rules/require-revalidate-path-type.md) | `console.warn`. The call **does nothing**. | `a dynamic page path "…" was passed to "revalidatePath", but the "type" parameter is missing. This has no effect by default` | revalidatePath | rec: warn |
| [`require-auth-before-revalidate`](rules/require-auth-before-revalidate.md) | Nothing. It is the security heuristic. | Data-security doc: "verify authentication and authorization inside each one" | data-security | rec: warn |

### v0.2

| Rule | Basis | Preset |
|---|---|---|
| [`no-legacy-segment-config`](rules/backlog.md#cache-componentsno-legacy-segment-config) | With `cacheComponents`, exporting `dynamic`, `revalidate`, or `fetchCache` throws an error (migration guide). | `migration` |
| [`no-introspect-passthrough`](rules/backlog.md#cache-componentsno-introspect-passthrough) | `use cache` docs: "as long as you don't introspect them". | `strict` (warn) |
| [`serializable-cache-args`](rules/backlog.md#cache-componentsserializable-cache-args) | `use cache` docs: unsupported types as arguments. | `strict` (warn) |
| [`no-react-cache-across-boundary`](rules/backlog.md#cache-componentsno-react-cache-across-boundary) | `use cache` docs and migration guide: `React.cache` is isolated. | `strict` (warn) |

### Discarded or backlog

| Idea | Decision | Why |
|---|---|---|
| `no-unbounded-cache-tag` | Backlog (v2, cross-file) | Next documents nothing about cardinality. The only limits (256 characters, 128 tags per call) are dropped with a warning. Within one file, you cannot tell whether an argument comes from user input. A per-file version would produce many false positives and little value. |
| `use-cache-must-be-async` | Discarded | Next's transform already rejects it at compile time. |
| `prefer-use-cache-over-unstable-cache` | Discarded | It is an opinion. `unstable_cache` is still supported and persists across deploys, which `use cache` does not do. |
| `no-cache-tag-too-long` | Backlog (trivial) | It only matters for literals over 256 characters, which almost never occur. |
| Cross-file analysis for all rules | v2 (cachegraph) | It requires resolving imports and aliases (`@/lib/...`), which a per-file plugin does not do. See [ADR-005](decisions.md#adr-005-per-file-analysis-and-false-positive-policy). |

### Specification structure

Each rule specification has these sections, in this order: Summary, Rationale, Matrix (when the rule has one), Detection, Examples (invalid and valid), Options, Fixes and suggestions (when the rule has them), Edge cases, False-positive risk, Messages (exact English text), and Tests.

## Agent integration

The positioning is "deterministic rules that catch the Cache Components errors that agents write." This document explains how to make that real and measurable.

### 1. Why a lint rule and not a skill

A skill or `AGENTS.md` asks the agent not to read `cookies()` inside `use cache`. A lint rule **checks** it and returns the error with the fix.

This is the thesis of the November 2026 anti-slop wave (see `research.md` §2) and of Evil Martians: "Move deterministic checks out of AI skills."

The two complement each other: the skill installs the lint rules and the hook, and the lint rules enforce the constraints.

### 2. Output format

- oxlint has `--format agent` (**Verified** in the oxlint CLI docs, 2026-11-26). **Unverified:** the exact output format, and whether it includes suggestions.
- Rule messages are already self-contained (what, why, how, and a URL), so they work with `unix`, `default`, or `agent` output.
- In CI, use `--format github`, which leaves annotations on the pull request.

### 3. Hook recipes

These are examples for the public documentation. Hook formats change often, so check each harness's reference again before publishing a recipe.

#### Claude Code (PostToolUse on Edit/Write)

**Verified** against the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) on 2026-11-26:

- A command hook receives its input as JSON on stdin. The edited file is in `tool_input.file_path`. There is no `CLAUDE_FILE_PATHS` environment variable.
- To warn the agent, print `hookSpecificOutput.additionalContext`. Claude Code inserts it into the agent's context as a system reminder.
- To block, print `{"decision": "block", "reason": "..."}` instead.

```jsonc
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/cache-components.sh" }
        ]
      }
    ]
  }
}
```

```bash
#!/usr/bin/env bash
# .claude/hooks/cache-components.sh
# Warn variant: lint the edited file and pass the findings to the agent as context.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs) ;;
  *) exit 0 ;;
esac

if ! findings=$(npx oxlint --format agent "$file" 2>&1); then
  jq -n --arg ctx "$findings" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi
exit 0
```

For the block variant, replace the `jq -n` call with one that prints `{decision: "block", reason: $ctx}`. Document both variants: warn the agent, or block the step.

#### Codex, fx, OpenCode, and Gemini CLI

The same pattern applies: a post-edit hook that runs `oxlint` only on the files that were changed. If the harness has no hooks, put the instruction in `AGENTS.md`:

```md
After editing any file under `app/` or files containing "use cache", run `npx oxlint <files>` and fix every `cache-components/*` error before continuing.
```

#### Pre-commit and CI

- `lefthook`, `husky`, or `.vite-hooks/pre-commit` (pattern from `cloudflare/oxlint-config`): run `oxlint --deny-warnings` on the staged files.
- GitHub Actions: `npx oxlint -f github`.

### 4. Installation skill (distribution on skills.sh)

The plugin is distributed as an agent skill on skills.sh, in addition to npm. `dmmulroy/anti-slop` is distributed **as a skill**, and skills.sh is from Vercel. The skill is published from this repository at `skills/install-cache-components/SKILL.md` and installs with:

```bash
npx skills add <owner>/oxlint-cache-components --skill install-cache-components
```

The skill tells the agent to:
1. Detect the package manager, and whether `oxlint` (and its version) or ESLint is already present.
2. Install `oxlint-plugin-cache-components` (and `oxlint` if it is missing, at the same version as `@oxlint/plugins`).
3. Add the `recommended` preset to `oxlint.config.ts`, or merge it into `.oxlintrc.json`, without overwriting the existing configuration.
4. Offer to add the post-edit hook for the harness that is running.
5. Run `oxlint` once and summarize the findings. **It does not fix them automatically**; the user decides how to fix them.

Acceptance criterion: in a test repository with Next 16.4 and `cacheComponents: true`, the skill leaves the lint configured, and the first `oxlint` run reports the seeded errors.

### 5. Agent eval (testing the thesis)

Hypothesis: agents make Cache Components mistakes often, and the hook brings them close to zero.

Design (optional roadmap task, M5b):
- **Tasks (10 to 15):** each one pushes the agent toward a known error. Examples: "cache this page that shows the user's theme saved in a cookie"; "add invalidation when saving a post from a Route Handler"; "cache this component with a `revalidate` of 10 seconds inside a cached layout."
- **Setup:** a Next 16.4 app with `cacheComponents: true`; 2 or 3 agents (Claude Code, Codex, fx); each task runs N=3 times, with and without the hook.
- **Metrics:** violations per task (lint, plus `next build && next start` and one request to the route), functional success rate, turns, and tokens.
- **Publishable result:** "Without the hook, agents made X Cache Components errors across Y tasks; with the hook, Z." Publish the methodology and the transcripts.
- **Risk:** if agents rarely make these mistakes, the thesis weakens. In that case, publish the result anyway, since it is an honest data point, and frame the project around errors that only appear in `next start`.
