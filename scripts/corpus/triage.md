# Corpus triage

The false-positive review of each corpus run. Review up to 30 findings per rule, then compute the false positive rate as FP / (TP + FP). The thresholds are in [`README.md`](README.md#thresholds).

The per-finding results in `scripts/corpus/results/` stay on the machine that ran the corpus and are not committed. This file does not name repositories with confirmed bugs. Reporting a bug to a corpus repository needs approval from the maintainer, case by case.

## Run of 2026-11-26, plugin 0.2.1

61 repositories: the 60 with the most stars from `repositories.tsv`, plus `vercel/shop`. `all` preset, plugin 0.2.0 with the changesets of 0.2.1 at commit `c58703c`, oxlint 1.95.0. No plugin errors.

This run reviews the rules added in 0.2.0. The rules from 0.1.0 report the same findings as the final run of 0.1.0 below, except two from `const` alias tracking. Both are in one Route Handler that calls `revalidateTag()` through `const revalidateTagWithoutProfile = revalidateTag as ...`. `require-revalidate-tag-profile` reports the one-argument call, a true positive. The `require-auth-before-revalidate` report of the same function moves to that earlier call.

| Rule | Reports | In scope | Reviewed | TP | FP | FP rate | Preset |
|---|---|---|---|---|---|---|---|
| `no-legacy-segment-config` | 498 | 5 | 5 | 5 | 0 | 0% | `migration` |
| `no-react-cache-across-boundary` | 0 | 0 | 0 | 0 | 0 | none | `strict` (warn) |
| `no-introspect-passthrough` | 0 | 0 | 0 | 0 | 0 | none | `strict` (warn) |
| `serializable-cache-args` | 0 | 0 | 0 | 0 | 0 | none | `strict` (warn) |

Notes:

- `no-legacy-segment-config` reports only with `cacheComponents: true`, and the `all` preset sets it for every repository. A report is in scope when the nearest `next.config` of the file sets `cacheComponents: true`. The 5 reports in scope are in one test fixture that exports `runtime`, `revalidate`, and `dynamic`, which Next.js rejects with Cache Components. Of the other 493, 437 are in apps whose `next.config` does not enable Cache Components, including one where the option is commented out, and 56 are in directories without a `next.config`.
- `no-introspect-passthrough` and `serializable-cache-args` report nothing in the corpus, so the corpus does not measure their false-positive rate. The conformance cases in [`conformance/RESULTS.md`](../../conformance/RESULTS.md) confirm what they report.

### False positives fixed during the run

| Rule | Pattern | Fix |
|---|---|---|
| `no-react-cache-across-boundary`, 1 report | A `React.cache` function is called in a cached function and in a component that only the cached function renders, in a case ported from the Next.js test suite. Both calls run inside the cache scope and share the result. | A call counts as inside when its function is not exported and the file calls or renders it only from cached functions. |

### Performance

`pnpm corpus --limit 60 --baseline` on the same checkouts and machine:

| Version | Plugin | Empty JS plugin | Default config | Ratio to the empty plugin |
|---|---|---|---|---|
| 0.1.0 | 13.9 s | 17.9 s | 4.8 s | 0.78 |
| 0.2.0 | 518.0 s | 14.5 s | 4.2 s | 35.73 |
| 0.2.0 with the 0.2.1 changesets | 15.2 s | 19.0 s | 5.0 s | 0.80 |

Two changes in 0.2.0 caused the regression:

- `require-auth-before-revalidate` walked every code path from the invalidation back to the function entry, so each branch between the auth check and the invalidation doubled the work. One repository with a large admin Server Action took 496 s, against 0.6 s with the fix.
- `no-legacy-segment-config` ran the whole file analysis on every file that mentions `runtime`, `dynamic`, or `revalidate`, inside route segments or not. The repository with the most `no-legacy-segment-config` reports took 3.61 times as long as the empty plugin with 0.2.0, and 1.41 times with both fixes.

The [`Corpus` workflow](README.md#continuous-run) now fails a run above 2 times the empty plugin.

## Run of 2026-11-26, plugin 0.1.0

61 repositories: the 60 with the most stars from `repositories.tsv`, plus `vercel/shop`. `all` preset, plugin version 0.1.0, oxlint 1.95.0. No plugin errors.

| Rule | Reports | Reviewed | TP | FP | FP rate | Threshold |
|---|---|---|---|---|---|---|
| `no-request-api-in-cache` | 4 | 4 | 4 | 0 | 0% | 5% |
| `no-cache-api-outside-cache` | 0 | 0 | 0 | 0 | none | 5% |
| `require-cachelife-when-nested` | 0 | 0 | 0 | 0 | none | 5% |
| `no-invalid-cache-nesting` | 2 | 2 | 2 | 0 | 0% | 5% |
| `valid-invalidation-context` | 2 | 2 | 2 | 0 | 0% | 5% |
| `no-promise-args-to-cache` | 0 | 0 | 0 | 0 | none | 5% |
| `require-revalidate-tag-profile` | 44 | 44 | 44 | 0 | 0% | 15% |
| `require-revalidate-path-type` | 1 | 1 | 1 | 0 | 0% | 15% |
| `require-auth-before-revalidate` | 98, then 93 | 30 | 28 | 2 | 6.7% | 15% |

Notes:

- `require-revalidate-tag-profile` is syntactic. Every report is a one-argument `revalidateTag()` call imported from `next/cache`.
- The error-rule reports are in test fixtures and demos that reproduce the Next.js errors on purpose, plus one `updateTag()` call in a Route Handler and one `revalidatePath()` with a dynamic route and no type in applications.
- The `require-auth-before-revalidate` sample is every 3rd or 4th report. 21 of the 28 true positives are in test fixtures, examples, and demos. 7 are in applications: Server Actions or Route Handlers that invalidate the cache, and often write data, with no visible check.
- The sample of 30 comes from a run with 98 reports, before the `permission` wrapper pattern. The 2 false positives were actions wrapped by a permission-based action client. The `permission` wrapper pattern fixed them, and the final run has 93 reports.

### False positives fixed during the run

The first pass had 9 `transitive` reports and 311 `require-auth-before-revalidate` reports.

| Rule | Pattern | Fix |
|---|---|---|
| `no-request-api-in-cache` (`transitive`), 8 reports in one repository | A fetch helper reads `cookies()` only when a `session` flag is passed, and the cached callers never pass it. | Transitive uses must run unconditionally in each helper. |
| `require-auth-before-revalidate` | `await assertAdmin()`, `await requireAdmin()`, `requireCronAuth(request)`, `isUserAdmin()` before the invalidation. | Auth-like names, and awaited calls to imported or local functions. |
| `require-auth-before-revalidate` | `adminProcedure.input(schema).action(fn)`, `permissionActionClient(...).action(fn)`. | Wrapper names that indicate auth. |
| `require-auth-before-revalidate` | The action calls a data access helper in another file that checks auth inside. | Awaited calls to imported functions count as possible checks (`trustAwaitedCalls`). |
| `require-auth-before-revalidate` | `getViewer()` imported from `@/lib/auth`. | Functions imported from auth modules. |
| `require-auth-before-revalidate` | A webhook verifies an HMAC header against a secret constant. | Secret constants and `x-*-hmac-*` headers. |
| `require-auth-before-revalidate` | A public counter action is rate limited. | Rate limit calls. |
