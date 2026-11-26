# AGENTS.md

`oxlint-plugin-cache-components` is an oxlint JS plugin with rules for Next.js Cache Components: `"use cache"`, `cacheLife()`, `cacheTag()`, `revalidateTag()`, `updateTag()`, `refresh()`, and Server Actions. Most rules report, in the editor and in CI, an error or warning that Next.js otherwise shows only during `next build` or at runtime. The rule prefix is `cache-components/`.

## Repository layout

- `src/rules/`: one file per rule. `src/rules/index.ts` registers each rule with its preset severities.
- `src/utils/`: the shared per-file analysis. It covers directives, Next.js import bindings, file and function contexts, the call graph, code paths, `cacheLife` profiles, and messages.
- `src/configs.ts` and `src/index.ts`: the oxlint presets and the ESLint flat configs.
- `docs/rules/<rule>.md`: the public doc of each rule. The doc is authoritative. When a change alters what a rule reports, update its doc in the same change.
- `tests/rules/` and `tests/utils/`: `RuleTester` suites. `tests/e2e/` runs the built plugin with the oxlint CLI and with ESLint on `tests/fixtures/`. `tests/fixtures/next/` holds cases adapted from the Next.js test suite.
- `conformance/`: a pinned Next.js app and one case per rule, checked with `next build` and `next start`.
- `scripts/`: the corpus run, the Next.js message sync, the smoke test, and the package check.
- `skills/install-cache-components/`: the agent skill and its hook recipes.

## Conventions

- **Language:** everything is in English: documentation, code, messages, and commits.
- **Writing:** follow the "Writing documentation" section of `CONTRIBUTING.md` for every Markdown change.
- **oxlint API:** write rules with `defineRule` and `createOnce`, and wrap the plugin in `eslintCompatPlugin` from `@oxlint/plugins`. Never use `create` directly. Reset per-file state in `before`.
- **Presets:** a rule joins `recommended` only if it maps to a Next.js error or warning, a conformance case confirms it, and its false-positive rate on the corpus is under 5% as an error or under 15% as a warning. Heuristics go to `strict` as warnings.
- **Per-file analysis:** do not resolve imports across files. Report only what the file proves. When in doubt, do not report.
- **Bindings, not names:** detect `cookies`, `cacheTag`, and the other APIs by following the import from `next/headers`, `next/cache`, `next/server`, or `react` with scope analysis. A bare name is never enough.
- **Messages:** say what is wrong, why in one sentence, how to fix it, and link the Next.js docs. When Next.js throws the same error, reuse its wording and credit it in `THIRD_PARTY_NOTICES.md`.
- **Tests:** use `RuleTester` from `oxlint/plugins-dev` with Vitest. Each example in a rule doc is a test. `tests/plugin.test.ts` requires every messageId to appear in its rule's tests.
- **Code style:** no comments in source, tests, or scripts. Names and tests carry the intent.
- **Publishing:** do not publish to npm, open issues on other projects, or post anywhere without explicit approval from the maintainer.

## Commands

```bash
pnpm install
pnpm check         # oxfmt + oxlint + typecheck + tests
pnpm test          # Vitest + RuleTester, plus end-to-end tests with the oxlint CLI and ESLint
pnpm lint          # oxlint over this repo
pnpm typecheck
pnpm build         # tsdown -> dist/ (ESM + d.ts), checked with publint and Are the Types Wrong
pnpm corpus        # runs the plugin over public repositories; results stay local
pnpm next-sync     # compares Next.js canary error messages with the snapshot
pnpm conformance   # confirms each rule against a real Next.js build
```
