# Corpus triage

The false-positive review of each corpus run. Review up to 30 findings per rule, then compute the false positive rate as FP / (TP + FP). See the corpus section of [`documentation/architecture.md`](../../documentation/architecture.md#4-corpus-false-positives) for the thresholds.

The per-finding results in `scripts/corpus/results/` stay on the machine that ran the corpus and are not committed. This file does not name repositories with confirmed bugs. Reporting a bug to a corpus repository needs approval from the maintainer, case by case.

## Run of 2026-11-26

61 repositories: the 60 with the most stars from `documentation/corpus.tsv`, plus `vercel/shop`. `all` preset, plugin version 0.1.0, oxlint 1.95.0. No plugin errors.

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
| `require-auth-before-revalidate` | 98 | 30 | 28 | 2 | 6.7% | 15% |

Notes:

- `require-revalidate-tag-profile` is syntactic. Every report is a one-argument `revalidateTag()` call imported from `next/cache`.
- The error-rule reports are in test fixtures and demos that reproduce the Next.js errors on purpose, plus one `updateTag()` call in a Route Handler and one `revalidatePath()` with a dynamic route and no type in applications.
- The `require-auth-before-revalidate` sample is every 3rd or 4th report. 21 of the 28 true positives are in test fixtures, examples, and demos. 7 are in applications: Server Actions or Route Handlers that invalidate the cache, and often write data, with no visible check.
- The 2 false positives were actions wrapped by a permission-based action client. The `permission` wrapper pattern fixed them, and the final run has 93 reports.

### False positives fixed during the run

The first pass had 9 `transitive` reports and 311 `require-auth-before-revalidate` reports. The fixes are recorded in [ADR-008](../../documentation/decisions.md#adr-008-precision-fixes-from-the-first-corpus-run).

| Rule | Pattern | Fix |
|---|---|---|
| `no-request-api-in-cache` (`transitive`), 8 reports in one repository | A fetch helper reads `cookies()` only when a `session` flag is passed, and the cached callers never pass it. | Transitive uses must run unconditionally in each helper. |
| `require-auth-before-revalidate` | `await assertAdmin()`, `await requireAdmin()`, `requireCronAuth(request)`, `isUserAdmin()` before the invalidation. | Auth-like names, and awaited calls to imported or local functions. |
| `require-auth-before-revalidate` | `adminProcedure.input(schema).action(fn)`, `permissionActionClient(...).action(fn)`. | Wrapper names that indicate auth. |
| `require-auth-before-revalidate` | The action calls a data access helper in another file that checks auth inside. | Awaited calls to imported functions count as possible checks (`trustAwaitedCalls`). |
| `require-auth-before-revalidate` | `getViewer()` imported from `@/lib/auth`. | Functions imported from auth modules. |
| `require-auth-before-revalidate` | A webhook verifies an HMAC header against a secret constant. | Secret constants and `x-*-hmac-*` headers. |
| `require-auth-before-revalidate` | A public counter action is rate limited. | Rate limit calls. |
