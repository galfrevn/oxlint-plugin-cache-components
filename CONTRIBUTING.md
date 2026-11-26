# Contributing

Contributions are welcome: bug reports with a reproduction, false-positive reports from real code, rule proposals backed by Next.js behavior, and fixes.

## Design changes

- Open an issue to discuss a change to the design. If the repository has Discussions enabled, a discussion works too.
- Propose a change to an architecture decision in an issue first. Then open a pull request with the change.
- Decisions live in [`documentation/decisions.md`](documentation/decisions.md). Until the first release, a change to a decision updates its record in place. After the first release, a new record supersedes the old one.
- Documentation changes follow [Writing documentation](#writing-documentation).

## Before you start

Open an issue before you start non-trivial work. Agree on the scope first, so that a pull request does not arrive for a design that the maintainer has not reviewed.

## Development setup

The repository pins Node.js 24 in `.node-version` and pnpm 11.21.0 in `packageManager`. Development needs Node.js 22.18 or later, because the tooling and `oxlint.config.ts` need it.

```bash
pnpm install
pnpm check         # oxfmt, oxlint, TypeScript, and every test
pnpm test          # Vitest: RuleTester suites and end-to-end tests
pnpm lint          # oxlint over this repository
pnpm typecheck
pnpm build         # tsdown, ESM and type declarations in dist/
pnpm corpus        # runs the plugin over the corpus
pnpm next-sync     # compares Next.js error messages with the snapshot
pnpm smoke         # runs the built plugin with the oxlint CLI
```

The conformance app (`pnpm conformance`) is planned in task T4.1 of the [roadmap](documentation/roadmap.md).

## Proposing a new rule

Every rule must map to Next.js behavior that already exists. Next.js must throw an error, log a warning, or do nothing for a call that looks valid. See [ADR-006](documentation/decisions.md#adr-006-nextjs-errors-as-the-source-of-truth-for-the-catalog).

1. Find the Next.js source for the behavior. The source of truth is `packages/next/src/server/use-cache/use-cache-messages.ts` and `packages/next/src/server/web/spec-extension/revalidate.ts` in `vercel/next.js`.
2. Open an issue that quotes the Next.js error or behavior, links its source, and shows an invalid and a valid example.
3. Write the specification in `documentation/rules/<rule-name>.md`. Follow the section order in [the rule catalog](documentation/spec.md#specification-structure).
4. Include at least one invalid example and one valid example. Include a false-positive analysis in the "False-positive risk" section.
5. Add the rule to the rule catalog in [`documentation/spec.md`](documentation/spec.md#rule-catalog).

A rule joins `recommended` only when it maps to a Next.js error or warning, the conformance app confirms the mapping, and the false-positive rate on the corpus is under 5%. Heuristics ship as `warn` or in `strict`.

## Coding agents

Read [`AGENTS.md`](AGENTS.md) before you use a coding agent on this repository. It lists the conventions that agents must follow.

Contributors are responsible for every line they submit. This includes code written with an agent. Review the code before you open a pull request, and be able to explain each change.

Keep pull requests small. Each rule change includes tests for its invalid and valid examples.

## Commit messages

Write commit messages in the imperative mood, for example `docs: add contributing guide`. Use a Conventional Commits prefix. The preferred prefixes are `feat`, `fix`, `docs`, and `chore`.

## Pull requests

Link the issue that the pull request resolves. Keep the description short: what changes, and why. Before you ask for review, check that tests pass, docs are updated, and the [writing checklist](#checklist-before-you-open-a-pull-request) holds.

## License

Contributions are licensed under the [MIT license](LICENSE), the same license as the project.

## Writing documentation

This guide applies to every Markdown file in this repository: the README, the files in `documentation/`, ADRs, rule docs, issue templates, and release notes. Reviewers can reject a change that breaks it.

The goal is documentation an engineer can trust and skim. Every sentence should either state a fact, give an instruction, or explain a decision.

### Rules

#### Say what is true, and only that

- Describe what exists in the present tense. Describe what does not exist yet as planned, and label it: "Planned for v0.2".
- Do not state performance numbers, adoption numbers, or compatibility claims without a source or a benchmark in this repository. Link to it.
- Mark facts by how well they are checked: **Verified** (checked against the primary source, with date), **Secondary source** (reported by a third party), or **Unverified** (needs checking; say what to check).
- If you do not know something, write that you do not know it and what would settle it.

#### Lead with the point

- Put the conclusion or the instruction in the first sentence of a section.
- One idea per paragraph. Paragraphs of one to four sentences.
- Prefer short sentences. Split any sentence that needs more than one comma-separated clause to be understood.
- Use the active voice and name the actor: "The analyzer reads `'use server'` files", not "`'use server'` files are read".

#### Be concrete

- Prefer an example, a file path, an API name, or a number over an adjective.
- Commands must be copy-pasteable. Code blocks must declare a language.
- Put identifiers, file names, commands, and config keys in backticks.

#### Formatting

- Headings in sentence case: "Release process", not "Release Process".
- Use a list only for items that are parallel. Use a table only when readers compare items across the same columns.
- Bold is for a term being defined or for a warning that prevents damage. At most one bold phrase per paragraph.
- No emoji, in headings or in prose. Status markers are words (see above).
- No exclamation marks and no rhetorical questions.
- Use periods and commas instead of chains of em dashes.
- Dates in ISO format: `2026-11-26`. American English spelling.
- Link text describes the target: "see the [documentation index](README.md#documentation)", not "click [here](README.md#documentation)".

#### Do not pad

- No introductions that restate the title, no "Overview" that repeats the next section, no closing summary that repeats the document.
- No "Key takeaways", "In conclusion", or "TL;DR" sections in technical docs. The first paragraph already serves that purpose.
- Do not explain what the reader already knows from the heading.

### Words and phrases to avoid

These words usually signal filler or marketing. Replace them with the concrete claim, or delete them.

| Avoid | Write instead |
|---|---|
| blazing fast, lightning fast, blazingly | the measured number, with a link to the benchmark |
| seamless, seamlessly, effortless, frictionless | describe the actual steps |
| powerful, robust, cutting-edge, state-of-the-art, next-generation, world-class, best-in-class | what it does |
| leverage, utilize, harness | use |
| delve, dive into, deep dive | read, explain, look at |
| comprehensive, holistic, end-to-end (as praise) | list what is covered |
| streamline, supercharge, elevate, empower, unlock, unleash, revolutionize, game-changer | the specific effect |
| simply, just, easily, obviously, of course | delete |
| it's worth noting that, it's important to note that | delete, then state the fact |
| plays a crucial / pivotal / vital role | what it does |
| in today's fast-paced world, in the ever-evolving landscape | delete |
| rich ecosystem, vibrant community | name the projects or people |
| a testament to, navigate the complexities of | delete or rewrite |
| Moreover, Furthermore, Additionally (stacked) | start a new sentence or a new paragraph |

### Checklist before you open a pull request

- [ ] Every claim about speed, size, adoption, or compatibility has a source or a benchmark link.
- [ ] Planned features are labeled as planned.
- [ ] No word from the table above appears, unless it is quoted from a source.
- [ ] Relative links and anchors resolve.
- [ ] Code blocks declare a language and run as written.

## Reporting a vulnerability

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## Code of conduct

This project adopts the Contributor Covenant, version 2.1. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
