# Roadmap

Tasks are meant to be taken **in order** by an agent, one per PR. Each has acceptance criteria (AC). The total estimate for v0.1 is 10 to 14 days.

## M0 — Repo setup (day 1)

**T0.1 Scaffold**
- pnpm, TypeScript (strict), `tsdown` (ESM + d.ts), Vitest, `oxlint` 1.95.0, and `@oxlint/plugins` ^1.95.0.
- `package.json` as described in `architecture.md`, with `exports` for `.` and `./configs`.
- The repo's `oxlint.config.ts` (the repo lints itself).
- AC: `pnpm build` produces `dist/index.js`. An example `oxlint.config.ts` with `jsPlugins: ["./dist/index.js"]` loads the plugin without errors, even though it has no rules yet.
- Status: done.

**T0.2 CI**
- Workflows from the CI section of `architecture.md`, without the corpus.
- AC: CI passes with the oxlint matrix.
- Status: done. `.github/workflows/ci.yml` also runs ESLint 9 and 10, and Node.js 20.19 to 26. `release.yml`, `codeql.yml`, `dependency-review.yml`, and Dependabot cover releases and security.

**T0.3 License and third-party notices**
- License: MIT ([ADR-007](decisions.md#adr-007-license)).
- `THIRD_PARTY_NOTICES.md` credits the messages and fixtures adapted from Next.js (MIT).
- AC: both files exist, and the README mentions them.
- Status: done.

## M1 — Analysis utilities (days 2 to 4)

**T1.1 `directives.ts`**
- AC: tests for file and function directives, covering all variants of `use cache`, `'use server'`, and `'use client'`, with single and double quotes. Directive prologues are told apart from loose strings. Confirm how oxc serializes directives, and document it in `research.md`.
- Status: done.

**T1.2 `next-bindings.ts`**
- AC: named imports, aliases, and namespace imports from `next/headers`, `next/server`, `next/cache`, and `react` resolve. A shadowed identifier does not resolve. `requestApis` works with and without the `module:` prefix.
- Status: done.

**T1.3 `contexts.ts`**
- AC: `FileKind` is correct for `app/**/route.ts`, `src/app/**/page.tsx`, `proxy.ts`, `middleware.ts`, `'use server'`, and `'use client'`. `FnContext` is correct for actions (file-level and inline), HTTP handlers, segment components, `generateStaticParams`, and `generateMetadata`. Confirm that `context.filename` works in RuleTester; if it does not, document a workaround.
- Status: done.

**T1.4 `call-graph.ts` + `analysis.ts`**
- AC: edges for calls and for JSX, cycle protection, `reachableFrom` with depth, and `getEffectiveContexts`. Measure memoization per `Program`. If it is not shared between rules, document that.
- Status: done. The analysis is shared between rules (see `research.md` §1).

**T1.5 `cache-life.ts` and `messages.ts`**
- AC: the profile table is identical to the docs. `isShortLived` handles presets, inline objects, and `shortProfiles`. Messages include URLs.
- Status: done. The classifier is `classifyCacheLife`.

## M2 — Rules, wave 1 (days 4 to 7)

For each rule: implementation, tests from the specification, a public doc at `docs/rules/<rule>.md` (in English), and addition to the presets.

- **T2.1** `no-request-api-in-cache` (direct, then transitive).
- **T2.2** `no-cache-api-outside-cache`.
- **T2.3** `valid-invalidation-context`.
- **T2.4** `require-revalidate-tag-profile`.
- **T2.5** `require-revalidate-path-type`.
- Common AC: all specification tests pass, suggestions are tested, and `pnpm lint` and `pnpm typecheck` are clean.
- Status: done.

## M3 — Rules, wave 2 (days 7 to 9)

- **T3.1** `require-cachelife-when-nested`.
- **T3.2** `no-invalid-cache-nesting`.
- **T3.3** `no-promise-args-to-cache`.
- **T3.4** `require-auth-before-revalidate`.
- Common AC: same as M2.
- Status: done.

## M4 — Next conformance (days 8 to 10, in parallel with M3)

**T4.1 Conformance app**
- `conformance/next-app` on Next 16.4.x, with one route per invalid example of the v0.1 rules.
- AC: `pnpm conformance` confirms the error or warning for each `recommended` rule. The items marked **Unverified** are settled in the docs: `connection()` in private, `params` without `await`, remote inside private, arrow functions with a directive, and custom directives.
- Status: open.

**T4.2 Next fixtures**
- AC: fixtures imported with attribution, and a comparison test that passes, with each difference justified.
- Status: done. 28 fixtures from 4 Next.js test directories are in `tests/fixtures/next/`. `tests/e2e/next-fixtures.test.ts` compares the findings with `manifest.json`, which justifies each Next.js error the plugin does not report.

## M5 — Corpus and false positives (days 10 to 12)

**T5.1 Runner** (`scripts/corpus/run.mjs`).
- AC: runs over the 60 repos with the most stars, plus `vercel/shop`, and produces JSON and a summary.
- Status: done.

**T5.2 Triage**
- AC: one triaged sample per rule in `triage.md`, and the FP rate calculated. Rules outside the threshold are fixed or moved down a preset, with an ADR.
- Status: done. Two rules were fixed ([ADR-008](decisions.md#adr-008-precision-fixes-from-the-first-corpus-run)).

**T5.3 Performance**
- AC: measured overhead stays below 2 times the time oxlint takes with its default config.
- Status: measured, AC not met. An empty JS plugin is already about 4 times slower than the default config on oxlint 1.95.0, and this plugin is faster than an empty JS plugin across the corpus. See `research.md` §7.

**T5b (optional, high value for the launch) Agent eval** (`spec.md`, "Agent integration", item 5).
- AC: 10 tasks × 2 agents × 3 runs, with and without the hook, with publishable results and methodology.
- Status: open.

## M6 — Presets, integration and v0.1 release (days 12 to 14)

**T6.1 Presets** `recommended`, `strict`, and `all` for oxlint, and `flat/recommended` for ESLint.
- AC: the examples in `spec.md` work when copied as-is into a test project.
- Status: done. `tests/e2e/oxlint.test.ts` runs both configuration forms from `spec.md` with the oxlint CLI.

**T6.2 Public README** updated to the release state, and one doc per rule.
- Status: done.

**T6.3 Skill `install-cache-components`** (`spec.md`, section Agent integration).
- AC: tested in a test repository with Claude Code and with another harness.
- Status: open. The skill is written. Testing it needs the package on npm.

**T6.4 Hook recipes** tested on at least 2 harnesses (Claude Code and one more).
- Status: open. The recipes are in `skills/install-cache-components/references/hooks.md`.

**T6.5 Release**
- Changeset, `v0.1.0`, and tag. **The maintainer publishes to npm.**
- AC: `npm pack` contains only `dist`, `docs`, `THIRD_PARTY_NOTICES.md`, `LICENSE`, and the README.
- Status: ready for the maintainer. `scripts/check-package.mjs` checks the package contents in CI, and the package also includes `CHANGELOG.md`. The `Release` workflow publishes 0.1.0 after the maintainer approves it in the `npm` environment (see "Releasing" in `CONTRIBUTING.md`).

**T6.6 Community files** before the repository goes public: `SECURITY.md` and `CODE_OF_CONDUCT.md` (their text is in the last two sections of `CONTRIBUTING.md`), issue forms for bugs and rule proposals, and a pull request template.
- AC: GitHub shows the security policy and the code of conduct in the repository's community profile.
- Status: done.

## v0.2 (weeks 3 and 4)

- `no-legacy-segment-config` (`migration` preset), `no-introspect-passthrough`, `serializable-cache-args`, and `no-react-cache-across-boundary`.
- Real dominance analysis with code path analysis in `require-auth-before-revalidate`.
- Global options through `settings` (if they are confirmed to reach plugins).
- Native Rust port of 1 or 2 rules for oxlint's `nextjs` plugin, if the oxc team shows interest.

## v2 — cachegraph (later)

Cross-file analysis with resolution of imports and `tsconfig` aliases. A graph of `cacheTag`, `revalidateTag`, and `revalidatePath` (what invalidates what, and orphaned tags). Probably as a separate tool that reuses the utils.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Next's API changes.** Next 16.x ships almost every month, with changes to signatures, messages, and the semantics of `private` and `remote`. | High | Medium | Weekly `next-sync` job over `use-cache-messages.ts` and `revalidate.ts`. The conformance app is pinned and re-run on every Next upgrade. Compatibility table per Next version in the README. |
| R2 | **Next's docs contradict themselves** (already happened with `connection()`). | Medium | Medium | The source code takes precedence. Each Unverified item is resolved in the conformance app before the rule enters `recommended`. |
| R3 | **oxlint JS plugins are in alpha.** The API may change or differ from ESLint. | Medium | High | Use only documented APIs. CI with an oxlint min/latest matrix. Report differences upstream. `eslintCompatPlugin` is a safety net: if oxlint breaks, the plugin still works in ESLint. |
| R4 | **False positives from heuristics** (`require-auth-before-revalidate`, `component-render`). | Medium | High (a noisy plugin gets uninstalled) | False-positive thresholds per preset and mandatory triage. When in doubt, do not report (ADR-005). Options to silence rules. |
| R5 | **Objection: "Next already catches it in dev."** | High | Medium | The answer is concrete: several errors appear only in `next start`, during prerender, or as `console.warn`. B1 and B2 are silent no-ops. Agents edit code without running the app. The agent eval quantifies this. |
| R6 | **Vercel or Next ship their own rules,** or add them to the dev overlay or to `eslint-plugin-next`. | Medium | Medium | Offer the rules upstream and collaborate with the maintainers. Keep the plugin focused on what Next.js does not cover. |
| R7 | **Low interest:** lint rules have a narrow audience. | High | Medium | The main hook is the silent no-ops and the agent eval, not the lint rules alone. Corpus data supports each claim. |
| R8 | **Framing the plugin as a security tool,** for example by citing the RCE of 2026-10-14. | Medium | High (credibility) | Prohibited (see `spec.md`, non-goals). Rule C1 covers cost and abusive invalidation, not RCE. |
| R9 | **Spam to repos in the corpus.** | Low | High (reputation) | Process in `architecture.md`: only reproduced true positives, one issue per repo, case-by-case approval, and a PR over an issue. |
| R10 | **Licenses:** messages and fixtures taken from Next. | Low | Medium | Next is MIT. Attribution in `THIRD_PARTY_NOTICES.md` and in the header of each fixture. Do not copy Next's implementation code, only messages and test cases. |
| R11 | **Name:** "cache-components" or "next" in the name can read as official. | Low | Low | The README states "community project, not affiliated with Vercel." Do not use the Next logo. See ADR-004. |
| R12 | **Performance:** the per-file call graph in each rule multiplies the cost. | Low | Medium | Textual prefilter in `before` and memoization per `Program`. Measured on the corpus (T5.3). |
| R13 | **Version drift** between `@oxlint/plugins` and the user's oxlint version. | Medium | Low | Caret range (`^`) in dependencies, the CI matrix, and the minimum oxlint version documented in the README. |
| R14 | **Scope creep:** all 13 rules at once, or cachegraph too early. | Medium | High | v0.1 is limited to 9 rules. Everything else stays on the roadmap. |

### What not to do

- Do not report in `unknown` contexts.
- Do not use automatic `fix` when the semantics change. Use suggestions only.
- Do not resolve imports across files in v0.1.
- Do not mark `unstable_cache` as bad.
- Do not publish figures without methodology, or name repos with bugs without permission.
- Do not open a PR on `vercel/next.js` without a prior signal from the team.
