# oxlint-plugin-cache-components

An oxlint JS plugin with lint rules for Next.js Cache Components (`"use cache"`). Most rules report a mistake that Next.js already rejects at runtime or during build, so the mistake shows up in the editor and in CI instead.

**Status:** design phase. There is no code and no npm release yet. The design is in [`documentation/`](#documentation).

## What it checks

The v0.1 plan has nine rules. Each rule links to its specification in `documentation/rules/`.

| Rule | What it catches | Preset |
|---|---|---|
| [`no-request-api-in-cache`](documentation/rules/no-request-api-in-cache.md) | Request-time APIs read inside a cache scope, such as `cookies()`, `headers()`, and `searchParams`. | `recommended`: error |
| [`no-cache-api-outside-cache`](documentation/rules/no-cache-api-outside-cache.md) | `cacheTag()` or `cacheLife()` called where no `use cache` scope exists. | `recommended`: error |
| [`require-cachelife-when-nested`](documentation/rules/require-cachelife-when-nested.md) | A cached function without `cacheLife()` that calls a short-lived cached function from the same file. | `recommended`: error |
| [`no-invalid-cache-nesting`](documentation/rules/no-invalid-cache-nesting.md) | Cache directive combinations that Next rejects, such as `use cache: private` inside a public cache. | `recommended`: error |
| [`valid-invalidation-context`](documentation/rules/valid-invalidation-context.md) | `revalidateTag`, `revalidatePath`, `updateTag`, or `refresh` called where Next does not allow them. | `recommended`: error |
| [`no-promise-args-to-cache`](documentation/rules/no-promise-args-to-cache.md) | Request-data promises, such as `searchParams`, passed to a cached function without `await`. | `recommended`: error |
| [`require-revalidate-tag-profile`](documentation/rules/require-revalidate-tag-profile.md) | `revalidateTag(tag)` with one argument, which Next deprecates. | `recommended`: warn |
| [`require-revalidate-path-type`](documentation/rules/require-revalidate-path-type.md) | `revalidatePath()` with a dynamic path and no `type` argument. The call does nothing. | `recommended`: warn |
| [`require-auth-before-revalidate`](documentation/rules/require-auth-before-revalidate.md) | Cache invalidation in a Server Action or Route Handler with no visible auth check before it. | `recommended`: warn |

The `strict` preset raises every rule to error. The rules analyze one file at a time. A helper imported from another file is not checked (see [ADR-005](documentation/decisions.md#adr-005-per-file-analysis-and-false-positive-policy)).

Eight of the nine rules map to an error or warning that Next.js already emits (see [ADR-006](documentation/decisions.md#adr-006-nextjs-errors-as-the-source-of-truth-for-the-catalog)). `require-auth-before-revalidate` is a security heuristic and ships as `warn`.

The planned message for `no-request-api-in-cache` in a transitive case reads:

```text
`getTheme()` reads `cookies()` (line 4), and it's called inside "use cache" function `Header`. Read the value outside the cached function and pass it as an argument. See https://nextjs.org/docs/messages/next-request-in-use-cache
```

## Planned for v0.2

- [`no-legacy-segment-config`](documentation/rules/backlog.md#cache-componentsno-legacy-segment-config), in a `migration` preset.
- [`no-introspect-passthrough`](documentation/rules/backlog.md#cache-componentsno-introspect-passthrough), [`serializable-cache-args`](documentation/rules/backlog.md#cache-componentsserializable-cache-args), and [`no-react-cache-across-boundary`](documentation/rules/backlog.md#cache-componentsno-react-cache-across-boundary), as `warn` in `strict`.

## Planned usage

This is the planned API. It may change before the first release.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
import cacheComponents from "oxlint-plugin-cache-components/configs";

export default defineConfig({
  extends: [cacheComponents.recommended],
});
```

The planned install command is `pnpm add -D oxlint oxlint-plugin-cache-components`. The full planned configuration, including the manual `.oxlintrc.json` form, is in the [product spec](documentation/spec.md#product-spec).

## Use with coding agents

The project plans to test whether coding agents make these Cache Components mistakes. The planned rule messages are written for agents as well as people: each one says what is wrong, why, how to fix it, and which Next.js docs page to read. The planned agent hooks and install skill are described in the [agent integration plan](documentation/spec.md#agent-integration).

## Documentation

- [Specification](documentation/spec.md): the problem, goals, v0.1 scope, presets, message format, the rule catalog, and agent integration.
- [Architecture](documentation/architecture.md): package layout, the oxlint API, testing, and the corpus.
- [Roadmap](documentation/roadmap.md): milestones with acceptance criteria, and risks.
- [Decisions](documentation/decisions.md): architecture decision records, including the package name and license.
- [Research](documentation/research.md): the facts behind the design, with sources and dates.
- [Rules](documentation/rules/): one specification per v0.1 rule, plus the v0.2 backlog.

## Contributing

The project is in the design phase. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open an issue or a pull request.

## Security

Report vulnerabilities privately through GitHub private vulnerability reporting. The steps are in [CONTRIBUTING.md](CONTRIBUTING.md#reporting-a-vulnerability). Do not open a public issue for a vulnerability.

The scope covers the plugin code and the published npm package, including supply-chain issues.

## License

[MIT](LICENSE). The planned rule messages quote Next.js error text, which is also MIT licensed. The planned attribution file is `THIRD_PARTY_NOTICES.md`, created when the code lands (see [ADR-007](documentation/decisions.md#adr-007-license)).
