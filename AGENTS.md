# AGENTS.md

`oxlint-plugin-cache-components` is an oxlint JS plugin with deterministic rules for Next.js Cache Components (`use cache`, `cacheLife`, `cacheTag`, `revalidateTag`, `updateTag`, `refresh`, and Server Actions). Most rules move a real Next.js error or warning from runtime (`next start`, prerender) into the editor, CI, and the agent loop. The rule prefix is `cache-components/`.

## Start here

1. Read `documentation/spec.md` for what the plugin does and the rule catalog.
2. Read `documentation/architecture.md` before you touch code. It also covers testing and the corpus.
3. Take the next open task from `documentation/roadmap.md` and meet its acceptance criteria.
4. Each v0.1 rule has its spec in `documentation/rules/<rule>.md`. The spec is authoritative: if the code does not match it, update the spec in the same change and explain why. v0.2 rules are in `documentation/rules/backlog.md`.
5. Check `documentation/decisions.md` before you change anything it covers.

`documentation/research.md` holds the facts behind the design, with sources and dates. `documentation/corpus.tsv` lists the public repositories used to measure false positives.

## Conventions

- **Language:** everything is in English: documentation, code, comments, messages, and commits.
- **Writing:** follow the "Writing documentation" section of `CONTRIBUTING.md` for every Markdown change.
- **Private notes:** `documentation/internal/` is git-ignored. Never commit it, and never quote it in public files.
- **oxlint API:** `defineRule` + `createOnce`, with the plugin wrapped in `eslintCompatPlugin` from `@oxlint/plugins`. Never use `create` directly (ADR-001, ADR-002).
- **Recommended preset:** a rule joins `recommended` only if it maps to a real Next.js error or warning, the conformance app confirms it, and it has under 5% false positives on the corpus.
- **Per-file analysis:** do not resolve imports across files (that is v2). Report only what can be proven within the file. When in doubt, do not report (ADR-005).
- **Bindings, not names:** detect `cookies`, `cacheTag`, and the rest by following the import from `next/headers`, `next/cache`, or `next/server` with scope analysis. A bare name is never enough.
- **Messages for agents:** say what is wrong, why (one sentence), how to fix it, and a Next.js docs URL. When the error is the one Next.js throws, copy its wording, with MIT attribution.
- **Tests:** `RuleTester` from `oxlint/plugins-dev` with Vitest. Each invalid example in a rule spec is a test. `tests/plugin.test.ts` requires every messageId in its rule's tests.
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
pnpm corpus        # runs the plugin over the corpus; results stay local
pnpm next-sync     # compares Next.js canary error messages with the snapshot
```
