# Decisions

Architecture decision records. Until the first release, update a record in place when a decision changes. After the first release, add a new record that supersedes the old one.

## ADR-001: oxlint as the primary target, with `createOnce`

Status: Accepted
Date: 2026-11-26

### Context

The maintainer explicitly asked for an oxlint plugin.

In November 2026, a wave of deterministic "anti-slop" rules for agents is being built on oxlint: `dmmulroy/anti-slop`, `@nkzw/oxlint-config` 3.0, and `@cloudflare/oxlint-config`. oxlint passed 50M weekly downloads and has `--format agent`. The oxlint JS plugins are in **alpha**, but they have an API compatible with ESLint, with scope analysis, code paths, suggestions, and LSP.

### Decision

- The project is a **JS plugin for oxlint**, loaded with `jsPlugins`.
- All rules use `defineRule` and `createOnce` (oxlint's fast API), with `before` and `after` hooks. The plugin is wrapped with `eslintCompatPlugin` from `@oxlint/plugins`.
- `@oxlint/plugins` is in `dependencies` with a caret (`^`) range, and `oxlint` is an optional `peerDependency`. The minimum version is 1.95.0.
- The published code is compiled JavaScript (tsdown), not TypeScript.

### Consequences

- (+) The plugin joins the ecosystem with the most traction in lint for agents. When oxlint enables `createOnce` optimizations, the plugin gets faster without code changes.
- (+) It can be distributed as an `extends` preset and as a skill.
- (−) The API is in alpha, so it may change or have bugs. CI with a version matrix and upstream reports mitigate this.
- (−) JS plugins have no type-aware rules. Serializability and similar checks stay syntactic (v0.2).
- Rejected alternative: native rules in Rust inside oxc. This requires a PR to oxc for each rule, and the rules cannot be published as a separate package. It remains a future upstream path for one or two rules.

## ADR-002: ESLint compatibility as a secondary target (best effort)

Status: Accepted
Date: 2026-11-26

### Context

`eslintCompatPlugin` adds `create` to each rule by delegating to `createOnce`, so the same package runs on ESLint 9. Many Next projects still use `eslint-config-next`. Next's natural upstream is `eslint-plugin-next`, which is an ESLint plugin.

### Decision

- ESLint compatibility is kept **at no extra design cost**: same API, same package, and `configs["flat/recommended"]`, `configs["flat/strict"]`, and `configs["flat/all"]` exports.
- Limited guarantee: a CI smoke test with ESLint 9 and ESLint 10 on 3 fixtures. The full suite runs only on oxlint. ESLint 9 reached end of support in 2026, so the development dependency is ESLint 10, and the CI matrix keeps 9 for users who have not upgraded (revised 2026-11-26).
- The README tagline is "oxlint-first, also works in ESLint."

### Consequences

- (+) More reach, and a shorter path to porting rules to `eslint-plugin-next`.
- (+) A safety net if oxlint's alpha API breaks.
- (−) Subtle differences may appear between the two runtimes, for example in `context.filename` or scope analysis. Differences that appear are documented. They do not block the release.
- No APIs exclusive to ESLint or to oxlint are used outside `createOnce`, `before`, and `after`.

## ADR-003: Documentation language

Status: Accepted
Date: 2026-11-26
Revised 2026-11-26: internal design docs were previously written in Spanish.

### Decision

All repository documentation is written in English. This includes design docs, rule specs, ADRs, `AGENTS.md`, the README, `docs/rules/*`, the changelog, commit messages, issues, PRs, the skills.sh skill, and posts on X.

### Rationale

The project's audience (the Next/Vercel community, oxc/VoidZero, and developers and agents worldwide) is global. Agents also read English messages more reliably, and the messages reuse Next's wording, which is in English.

### Consequences

- Code, specs, and ADRs share one language, so agents read a single language across the repo.
- The exact messages in each specification are already in English and are copied as written.

## ADR-004: Package name

Status: Accepted
Date: 2026-11-26

### Context

- oxlint normalizes `oxlint-plugin-<x>` to `<x>` as the rule prefix. **Verified** in `crates/oxc_linter/src/config/plugins.rs`. The plugin name comes from, in order: alias, then `meta.name`, then the `name` field of `package.json`.
- Names reserved by native plugins include `nextjs`, `react`, `jsdoc`, and `import`. We cannot use `nextjs`.
- Available on npm as of 2026-11-26: `oxlint-plugin-cache-components`, `oxlint-plugin-next-cache`, `oxlint-plugin-use-cache`, and `@oxlint/plugin-cache-components`. The last scope belongs to oxc, so do not use it.

### Decision

The package is `oxlint-plugin-cache-components`, with rule prefix `cache-components/` and `meta.name: "cache-components"`. It is the term Next uses for the whole model (it includes `cacheLife`, `cacheTag`, and invalidation), and it is what someone searches for when they enable the flag.

The README must state "community project, not affiliated with Vercel."

### Candidates

| Package | Rule prefix | For | Against |
|---|---|---|---|
| `oxlint-plugin-cache-components` | `cache-components/` | It is the official name of the feature (`cacheComponents`), easy to search for, and specific | Long; may look official from Next |
| `oxlint-plugin-next-cache` | `next-cache/` | Short, and says "Next" | "next" may read as official, and it is less precise |
| `oxlint-plugin-use-cache` | `use-cache/` | Very memorable; it is the directive | Revalidation rules and Server Actions are not "use cache" |

### Consequences

Renaming after publishing is costly, because the prefixes appear in users' configs. The name is fixed before T6.5.

## ADR-005: Per-file analysis and false-positive policy

Status: Accepted
Date: 2026-11-26

### Context

The oxlint JS plugins (and the ESLint plugins) see one file at a time. Many Cache Components errors cross files. For example, a helper in `lib/auth.ts` reads `cookies()`, and a cached function in `app/page.tsx` imports it.

### Decision

1. **v0.1 analyzes only within a file.** It builds an intra-file call graph and does not resolve imports.
2. **Only provable findings are reported.** If a function's context is `unknown` (for example, an exported helper with no directive and no callers in the file), nothing is reported.
3. **False negatives are accepted and documented** in each specification, under "Edge cases."
4. Cross-file analysis is left for **cachegraph (v2)**, which reuses `utils/`.

### Rationale

A noisy linter gets uninstalled. An unexplained error, especially in an agent's loop, costs more than the bug it prevents. The project's credibility depends on every reported error being real.

### Consequences

- v0.1 coverage is partial, and the README states this plainly.
- The API of `utils/` is designed so that a later project-level analysis can feed the same contexts.

## ADR-006: Next.js errors as the source of truth for the catalog

Status: Accepted
Date: 2026-11-26

### Decision

- A rule enters `recommended` as `error` only if it maps to a runtime, build, or prerender error that Next already produces. It enters as `warn` if it maps to a Next warning (a deprecation or a no-op), or if it is a security heuristic backed by the official docs.
- The source of truth is the code of `vercel/next.js@canary`: `packages/next/src/server/use-cache/use-cache-messages.ts` and `packages/next/src/server/web/spec-extension/revalidate.ts`. The docs are secondary. If they contradict the code, the code wins (the `connection()` case).
- Rule messages reuse Next's wording when the error is the same (MIT, with attribution in `THIRD_PARTY_NOTICES.md`).
- The conformance app (the conformance app in the Testing section of `architecture.md`) confirms each mapping on a pinned Next version.
- The `next-sync` job detects changes in those files and proposes updating the rules or adding new ones.

### Rationale

- Against "this is opinion": each rule has a Next error behind it that can be cited.
- It makes the upstream proposal credible: the Next Discussion shows a table that says "this rule = this error in its code."
- It gives agents consistency between the lint error and the runtime error.

### Consequences

- Some useful ideas are not Next errors, such as tag cardinality or style preferences. Those stay out of `recommended` or are dropped.
- The project must keep pace with Next's changes (see R1 in [the risks](roadmap.md#risks)).

## ADR-007: License

Status: Accepted
Date: 2026-11-26

### Context

Rule messages quote Next.js error text. Next.js is MIT-licensed.

### Decision

The project is licensed under the MIT license.

### Consequences

When code lands, keep the Next.js copyright notice for quoted text in a `THIRD_PARTY_NOTICES.md` file.

## ADR-008: Precision fixes from the first corpus run

Status: Accepted
Date: 2026-11-26

### Context

The first corpus run (61 repositories, `all` preset, 2026-11-26) found two rules above their false-positive thresholds:

- `no-request-api-in-cache`, message `transitive`: 9 reports, 8 false positives. One repository reads `cookies()` in a helper only inside `if (is_session)`, and its cached callers never pass `is_session`.
- `require-auth-before-revalidate`: 311 reports. A sample of 30 had about 19 false positives. Auth helpers with custom names (`requireAdmin()`, `requireCronAuth()`, `adminProcedure`) explained about half. Server Actions that delegate to a data access layer in another file, which checks auth inside, explained most of the rest. The Next.js data security guide recommends that layer.

The architecture's rule is to fix a rule or move it down a preset, and to record the decision.

### Decision

Fix both rules, and keep them in their presets.

- `transitive` reports a request API only when it runs unconditionally in each helper on the path: not in a branch, a loop, a `catch` clause, a callback, or after a possible early exit. This follows ADR-005: a conditional read is not provable from the cached caller.
- `require-auth-before-revalidate` recognizes auth-like names, functions imported from auth modules, rate limits, secret constants, HMAC headers, and wrappers whose names indicate auth. With the new `trustAwaitedCalls` option (default `true`), an awaited direct call to an imported or local function before the invalidation counts as a possible check. Member calls on a client, such as `await db.posts.delete()`, do not count.

### Consequences

- (+) The second run had 1 `transitive` report, a true positive, and 93 `require-auth-before-revalidate` reports. A new sample of 30 had 2 false positives before the `permission` wrapper pattern, and none after it. Details are in `scripts/corpus/triage.md`.
- (−) More false negatives: a transitive read behind a condition, and a Server Action that awaits an unrelated helper before an unauthenticated invalidation, are no longer reported. Users can set `trustAwaitedCalls: false` for the stricter behavior.

