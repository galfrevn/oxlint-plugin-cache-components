# Architecture

## Package layout

```
oxlint-plugin-cache-components/                 # repo
├── AGENTS.md
├── documentation/                       # design docs, rule specs, ADRs
├── docs/rules/<rule>.md                 # public docs per rule, linked from meta.docs.url
├── src/
│   ├── index.ts                         # eslintCompatPlugin({ meta, rules }) plus flat/* ESLint configs
│   ├── configs.ts                       # oxlint presets: recommended, strict, all
│   ├── rules/
│   │   ├── index.ts                     # rule registry and preset severities
│   │   └── <rule>.ts                    # one file per rule
│   └── utils/
│       ├── analysis.ts                  # per-file analysis, memoized (FileAnalysis)
│       ├── ast.ts                       # walker, ESTree helpers, unconditional execution check
│       ├── cache-life.ts                # profile table and parsing of cacheLife(...)
│       ├── call-graph.ts                # intra-file call graph (+ JSX)
│       ├── contexts.ts                  # file kinds and function contexts
│       ├── directives.ts                # file and function directives
│       ├── fixes.ts                     # import planning and insertion helpers for suggestions
│       ├── messages.ts                  # docs URLs and scope labels
│       ├── next-bindings.ts             # bindings imported from next/* and react
│       ├── options.ts                   # rule options, shared settings, prefilters
│       └── props.ts                     # segment props such as searchParams
├── tests/
│   ├── rules/<rule>.test.ts             # RuleTester
│   ├── utils/*.test.ts                  # analysis utilities, through a probe rule
│   ├── plugin.test.ts                   # registry, docs, message coverage, presets
│   ├── e2e/                             # builds dist/, runs the oxlint CLI and ESLint
│   └── fixtures/                        # fixture app and configs for the e2e tests
├── scripts/
│   ├── corpus/run.mjs                   # clones and lints the corpus, aggregates results
│   ├── corpus/triage.md                 # false-positive review per run
│   ├── next-sync.mjs                    # compares canary sources with scripts/next-sync/snapshot/
│   ├── smoke.mjs                        # runtime check with the oxlint CLI, used on Node 20 in CI
│   └── check-package.mjs                # checks the files in the npm package
├── skills/install-cache-components/     # skill for skills.sh, with hook recipes
├── package.json
├── tsconfig.json                        # type checks src, tests, and configs
├── tsconfig.build.json                  # src only, with isolatedDeclarations for the d.ts build
├── tsdown.config.ts
├── vitest.config.ts                     # unit and e2e projects
└── oxlint.config.ts                     # the repo lints itself
```

Planned and not built yet: `conformance/next-app/` (task T4.1).

## `package.json` (sketch)

```jsonc
{
  "name": "oxlint-plugin-cache-components",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./configs": { "types": "./dist/configs.d.ts", "import": "./dist/configs.js" }
  },
  "files": ["dist", "docs", "THIRD_PARTY_NOTICES.md"],
  "engines": { "node": "^20.19.0 || >=22.12.0" },                   // same range as oxlint
  "peerDependencies": { "eslint": ">=9.0.0", "oxlint": ">=1.95.0" },
  "peerDependenciesMeta": { "eslint": { "optional": true }, "oxlint": { "optional": true } },
  "dependencies": { "@oxlint/plugins": "^1.95.0" },
  "devDependencies": { "oxlint": "1.95.0", "eslint": "10.x", "vitest": "5.x", "tsdown": "0.23.x", "typescript": "7.x", "oxfmt": "0.80.x" }
}
```

- **The package ships compiled JS**, not `.ts`. `dmmulroy/anti-slop` serves `.ts` directly because it is vendored, but a package in `node_modules` cannot depend on Node's type stripping.
- On `@oxlint/plugins`: `dmmulroy/anti-slop` pins it to the exact oxlint version. As a published package, we use a range (`^`) and test in CI with a matrix of the minimum and latest `oxlint` versions. See [ADR-001](decisions.md#adr-001-oxlint-as-the-primary-target-with-createonce).

## Rule lifecycle with `createOnce`

```ts
import { defineRule } from "@oxlint/plugins";
import { getFileAnalysis } from "../utils/analysis.ts";

export const noRequestApiInCache = defineRule({
  meta: {
    type: "problem",
    docs: { description: "…", url: docsUrl("no-request-api-in-cache") },
    messages: { cookies: "…", transitive: "…" },
    schema: [/* JSON schema for options */],
    defaultOptions: [{ requestApis: [] }],
  },
  createOnce(context) {
    let pending: Report[];
    return {
      before() { pending = []; },                  // per-file state
      CallExpression(node) { /* collect candidates */ },
      "Program:exit"() {
        const a = getFileAnalysis(context);        // full analysis, once per file
        for (const r of resolve(pending, a)) context.report(r);
      },
    };
  },
});
```

Implementation rules:
- **No state across files.** Everything resets in `before`. Reminder: `before` does not run when oxlint skips the rule for a file, but then no visitor runs either, so state does not leak.
- If a rule needs the full analysis of the file (call graph, contexts), **report in `Program:exit`**.
- To exit early, use `before` with a cheap text prefilter: if `context.sourceCode.text` does not contain `"use cache"`, `next/cache`, or `next/headers`, return `false` (see the corresponding rule).
- Do not call APIs that the oxlint docs do not list as supported.

## Shared per-file analysis (`utils/analysis.ts`)

```ts
export interface FileAnalysis {
  fileDirective: Directive | null;                 // 'use cache' | 'use server' | 'use client' | …
  fileKind: FileKind;
  bindings: NextBindings;
  functions: Map<FunctionNode, FunctionInfo>;
  callGraph: CallGraph;
}

export function getFileAnalysis(context): FileAnalysis; // memoized in WeakMap<Program, FileAnalysis>
```

The result is memoized per `Program` node and per analysis options (`appDir` and `requestApis`). oxlint passes the same AST object to every rule in a file (**Verified**, 2026-11-26), so the rules share one analysis. Each cache entry also stores the source text and file name, and is reused only when both match.

### Directives (`utils/directives.ts`)

```ts
export type CacheKind =
  | { type: "public" }                    // 'use cache'
  | { type: "remote" }                    // 'use cache: remote'
  | { type: "private" }                   // 'use cache: private'
  | { type: "custom"; name: string }      // 'use cache: <handler>'; treated as public (Unverified)
  | { type: "unstable" };                 // unstable_cache(...) callback

export type Directive =
  | { type: "cache"; kind: CacheKind; node: Node }
  | { type: "server"; node: Node }        // 'use server'
  | { type: "client"; node: Node };       // 'use client'

export function getFileDirective(program): Directive | null;
export function getFunctionDirective(fn: FunctionNode): Directive | null;
```

- In ESTree, a directive is an `ExpressionStatement` with a `directive` property (string) at the start of `Program.body` or of a function's body `BlockStatement` (**Verified** with `RuleTester`, 2026-11-26).
- Only prologues count: the directive must come before any other statement.
- Double and single quotes are equivalent. The directive must be exactly `use cache` or `use cache: <kind>` with one space after the colon, as in the Next.js transform. `use cache: default` is the public cache. Next.js rejects `'use cache:remote'` at compile time, so the plugin does not recognize it.
- Functions: `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression` with a block body.

### Cache scope

```ts
export interface CacheScope { kind: CacheKind; owner: FunctionNode | null; via: "function" | "file" | "unstable_cache" }
export function getCacheScope(node, a: FileAnalysis): CacheScope | null;
```

Algorithm: walk up the ancestors, function by function. The first function with a cache directive wins. That is either the callback of `unstable_cache(fn, …)` or an export from a file with a file-level `'use cache'`. If a function with `'use server'` appears on the way, stop: a nested action is not cached.

### Next bindings (`utils/next-bindings.ts`)

```ts
export interface NextBindings {
  fromNextHeaders: { cookies?: Ref; headers?: Ref; draftMode?: Ref };
  fromNextServer: { connection?: Ref };
  fromNextCache: { cacheLife?: Ref; cacheTag?: Ref; revalidateTag?: Ref; revalidatePath?: Ref; updateTag?: Ref; refresh?: Ref; unstable_cache?: Ref };
  fromReact: { cache?: Ref };
  namespaces: Map<string /*local*/, "next/headers" | "next/cache" | "next/server" | "react">;
  extraRequestApis: Ref[];                 // from the requestApis option
}
export function isCallTo(node: CallExpression, ref: Ref | undefined, b: NextBindings): boolean;
```

- Uses scope analysis (`context.sourceCode.getScope`) to resolve the identifier to its `ImportSpecifier`. This covers aliases (`import { cookies as c }`) and namespaces (`import * as h from "next/headers"; h.cookies()`). A shadowed identifier does not count.
- `next/cache` also exports `unstable_cacheLife` and `unstable_cacheTag` as deprecated aliases. They resolve to `cacheLife` and `cacheTag`. A default import of `next/cache`, such as `cache.revalidateTag()`, resolves like a namespace import.
- A function is either a **unit** or a transparent callback. A function passed directly as an argument, such as an `Array.prototype.map` callback, is transparent: its calls belong to the enclosing unit. Callbacks of `after()`, `unstable_cache()`, and `React.cache()` are units.

### Contexts (`utils/contexts.ts`)

```ts
export type FileKind =
  | "route-handler"    // **/app/**/route.{js,jsx,ts,tsx,mjs}
  | "proxy"            // proxy.{ts,js} or middleware.{ts,js} at the root or in src/
  | "segment"          // page, layout, template, default, not-found, error, loading, global-error
  | "server-actions"   // file with file-level 'use server'
  | "client"           // file with 'use client'
  | "other";

export type FnContext =
  | "server-action"           // async export from a 'use server' file, or a function with an inline 'use server'
  | "route-handler"           // GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS export from a route handler
  | "cached"                  // has a CacheScope
  | "component-render"        // server component: default export of a segment, or a PascalCase function that returns JSX in a file that is neither client nor server-actions
  | "build-time-generator"    // generateStaticParams, unstable_generateParamMatching
  | "metadata"                // generateMetadata, generateViewport (Unverified whether it counts as render)
  | "proxy"
  | "client"
  | "unknown";                // helper with no signals: NEVER reported for an unknown context

export function getFnContext(fn: FunctionNode | null, a: FileAnalysis): FnContext;
export function getEffectiveContexts(node, a: FileAnalysis): Set<FnContext>; // contexts reaching the node, via the call graph
```

- The file path comes from `context.filename` (relative to the cwd), and from the roots of `appDir`.
- `getEffectiveContexts` answers the key question: a helper without a directive can be in the `cached` context because a cached function in the same file calls it. It combines the function's own context with the contexts of its callers in the same file.

### Intra-file call graph (`utils/call-graph.ts`)

```ts
export interface CallSite { caller: FunctionNode | null; callee: FunctionNode; node: CallExpression | JSXOpeningElement; awaited: boolean }
export interface CallGraph {
  callsFrom(fn: FunctionNode | null): CallSite[];   // null = top level
  callersOf(fn: FunctionNode): CallSite[];
  reachableFrom(fn: FunctionNode, opts?: { maxDepth?: number; stopAt?: (f) => boolean }): Iterable<{ fn: FunctionNode; path: CallSite[] }>;
}
```

- Nodes: functions declared in the file (declarations, `const x = async () => {}`, `const x = function () {}`, default exports).
- Edges: a `CallExpression` whose callee resolves by scope to a function in the file, and a `JSXOpeningElement` whose name resolves to a component in the file.
- No dynamic calls, no object methods, and no imports. Those are v2.
- The default maximum depth is 10. Cycles are guarded by a `Set` of visited nodes.

### `cacheLife` (`utils/cache-life.ts`)

```ts
export const BUILTIN_PROFILES = { default: { stale: 300, revalidate: 900, expire: Infinity }, seconds: { stale: 30, revalidate: 1, expire: 60 }, minutes: {…}, hours: {…}, days: {…}, weeks: {…}, max: {…} };
export type ParsedCacheLife = { kind: "profile"; name: string } | { kind: "inline"; revalidate?: number; expire?: number; stale?: number } | { kind: "unknown" };
export function parseCacheLifeCall(call: CallExpression): ParsedCacheLife;
export function isShortLived(p: ParsedCacheLife, shortProfiles: string[]): boolean | "unknown"; // revalidate === 0 || expire < 300
```

### Messages (`utils/messages.ts`)

Constants hold the URLs from `research.md` §4. The `scopeLabel(kind)` function returns labels such as `"use cache"`, `"use cache: remote"`, and `unstable_cache()`, so the text matches Next's.

## Related ADRs

- [ADR-001](decisions.md#adr-001-oxlint-as-the-primary-target-with-createonce): oxlint as the primary target, with `createOnce`.
- [ADR-002](decisions.md#adr-002-eslint-compatibility-as-a-secondary-target-best-effort): ESLint compatibility via `eslintCompatPlugin`, best effort.
- [ADR-003](decisions.md#adr-003-documentation-language): documentation language.
- [ADR-004](decisions.md#adr-004-package-name): package name.
- [ADR-005](decisions.md#adr-005-per-file-analysis-and-false-positive-policy): per-file analysis and false-positive policy.
- [ADR-006](decisions.md#adr-006-nextjs-errors-as-the-source-of-truth-for-the-catalog): Next errors are the source of truth for the rule catalog.
- [ADR-007](decisions.md#adr-007-license): license (MIT).

## Testing

There are four layers. A rule does not enter `recommended` unless it passes all four.

### 1. Unit tests (RuleTester)

```ts
// tests/rules/no-request-api-in-cache.test.ts
import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noRequestApiInCache } from "../../src/rules/no-request-api-in-cache.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } }); // "tsx" is supported (Verified)

tester.run("cache-components/no-request-api-in-cache", noRequestApiInCache, {
  valid: [/* … */],
  invalid: [{ name: "cookies in use cache", code: "…", errors: [{ messageId: "requestApi" }] }],
});
```

- Every valid and invalid example in `rules/<rule>.md` is a test. If you add a test that is not in the specification, add it to the specification too.
- To control `context.filename` (route.ts, page.tsx, proxy.ts), RuleTester accepts `filename` per case (**Verified** in oxlint, 2026-11-26).
- The utils (`directives`, `next-bindings`, `contexts`, `call-graph`, and `cache-life`) have their own tests. They use `RuleTester` with a test rule that serializes the analysis into the message.
- Coverage: 100% of messageIds and suggestions. `tests/plugin.test.ts` fails when a messageId does not appear in its rule's tests, or when a rule has no public doc.
- End-to-end: `tests/e2e/` builds `dist/` in a Vitest global setup, runs the oxlint CLI on `tests/fixtures/app` with the two configuration forms from `spec.md`, and runs ESLint with `flat/recommended` on `tests/fixtures/eslint`.

### 2. Fixtures derived from Next.js

- Copy invalid cases from the tests of `vercel/next.js` (MIT) into `tests/fixtures/next/<folder>/`, with an attribution header and the source commit:
  - `test/e2e/app-dir/cache-components-errors`
  - `test/e2e/app-dir/cache-components-request-apis`
  - `test/e2e/app-dir/cache-components-route-handler-errors`
  - `test/e2e/app-dir/cache-components-segment-configs` (v0.2)
  - `test/e2e/app-dir/use-cache-*` (including `use-cache-close-over-function` and `use-cache-binary-args`)
  - `test/development/app-dir/use-cache-errors` and `cache-components-dev-errors`
- A test runs every fixture and compares what the plugin reports with what Next expects, according to the snapshot in its test. Each difference is classified by hand as an accepted false negative (cross-file or dynamic) or a bug.

### 3. Conformance app (the rule matches a real error)

`conformance/next-app/` is a Next app pinned to **16.4.x** with `cacheComponents: true`. It has one route for each invalid example of each rule.

- Script `pnpm conformance`: runs `next build && next start`, then one request to each route. It captures stderr and the response.
- Criterion: each invalid example of a `recommended` rule produces the error or warning its specification describes (compared with a substring of Next's message). Each valid example works.
- This settles the semantic questions marked **Unverified**: `connection()` in private, `params` without `await`, remote inside private, and introspection of `children`.
- Runs in CI weekly, and whenever the Next version is bumped.

### 4. Corpus (false positives)

#### Source

`documentation/corpus.tsv` (194 repos, 2026-11-26). Regenerate it with:

```bash
for q in '"use cache" cacheLife language:TypeScript' '"use cache" cacheTag language:TypeScript' \
         '"use cache: private" language:TypeScript' '"use cache: remote" language:TypeScript' \
         'cacheComponents: true filename:next.config.ts' 'cacheComponents: true filename:next.config.mjs' \
         '"use cache" updateTag language:TypeScript' '"use cache" revalidateTag language:TypeScript'; do
  gh search code "$q" --limit 100 --json repository --jq '.[].repository.nameWithOwner'
done | sort -u   # then: gh api repos/<r> for stars, archived, and fork
```

Roles: `corpus` (measured), `corpus-vercel-template` (`vercel/shop`, high priority), and `fixtures-only` (`vercel/next.js`: not measured, because its tests contain errors on purpose).

#### Runner (`scripts/corpus/run.mjs`)

1. Take the N repos with the most stars (default 60), plus `vercel/shop`.
2. Run `git clone --depth 1` into `.corpus/<owner>__<repo>` (listed in `.gitignore`). **It installs no dependencies and runs no code from the repos.**
3. Generate `.corpus/oxlintrc.json` from the `all` preset in `dist/configs.js`, with native rules off, and run `oxlint -c .corpus/oxlintrc.json --disable-nested-config --format json <repo>`. `--disable-nested-config` keeps oxlint from loading configuration files from the cloned repos, which could run their code. With `--baseline`, it also times oxlint with its default config.
4. Aggregate by rule and by messageId, matching each message against the rule's message templates: number of findings, files, and repos. Diagnostics whose message starts with `Error running JS plugin` are counted as plugin errors.
5. Write `scripts/corpus/results/<date>.json` and a summary in Markdown. The results stay local (listed in `.gitignore`), because they name files in third-party repositories.

#### Triage (`scripts/corpus/triage.md`)

Review each finding in the local results: `repo | file:line | rule | messageId | TP/FP/unsure | note`. Reviewing a sample of up to 30 per rule is enough. Then extrapolate. The committed `triage.md` records the counts, the FP rate per rule, and the false-positive patterns, without naming repositories with confirmed bugs.

#### Metric and thresholds

- **False positive rate per rule** = FP / (TP + FP), measured on the sample. FP means false positive.
- `recommended` as error: **< 5%**.
- `recommended` as warn (heuristics): **< 15%**.
- If a rule exceeds its threshold, fix it or move it to `strict`. Record the decision in an ADR.
- Performance: the full corpus run with our plugin must not take more than 2 times as long as oxlint with its default config. Measure with `hyperfine` or `time`.

#### Reporting real bugs (carefully)

1. Only when a finding is a **confirmed TP** and reproduces against the docs or the conformance app.
2. At most one issue per repo, grouping the findings. Better yet, a PR with the fix.
3. Write short, human text in English: what happens at runtime, the line, and the suggested fix. Mention the plugin at the end, without pushing it. No automated issues.
4. Opening an issue on a corpus repository needs maintainer approval, case by case (open question 4).
5. Record the link and status in `triage.md`. Cases the maintainer approves, or whose fix is merged, can be cited in the release notes.

### 5. CI (GitHub Actions)

- `check`: oxfmt, oxlint on this repo, `typecheck`, `build` (with publint and Are the Types Wrong), and `scripts/check-package.mjs`.
- `test` matrix: the minimum supported oxlint version (1.95.0) and `latest`.
- ESLint 9 and 10 smoke test: loads `flat/recommended` and lints 3 fixtures ([ADR-002](decisions.md#adr-002-eslint-compatibility-as-a-secondary-target-best-effort)).
- Runtime matrix: builds on Node.js 24, then runs `scripts/smoke.mjs` with the oxlint CLI on Node.js 20.19, 22.12, 24, and 26.
- Weekly `next-sync` job: downloads `use-cache-messages.ts` and `revalidate.ts` from `vercel/next.js@canary`, compares them with `scripts/next-sync/snapshot/`, and opens an issue if they changed. This surfaces candidate new rules and detects outdated messages.

### Corpus list

`corpus.tsv`: 194 public repos that use `use cache` or `cacheComponents`. Generated on 2026-11-26 with `gh search code` (the queries are in the "Source" subsection above). Forks and archived repos were excluded.

Columns: `stars`, `repo`, `pushed_at`, `archived`, `fork`, `license`, and `role`.

Roles:
- `corpus`: linted to measure false positives.
- `corpus-vercel-template`: `vercel/shop`, Vercel's official Shop template. High priority: if a real bug appears, it goes out as a PR, handled with care.
- `fixtures-only`: `vercel/next.js`. Not usable for measuring false positives, because its tests contain errors on purpose. It is the source of the invalid cases.

Notes:
- GitHub code search returns at most 100 results per query, so the corpus is a sample, not a census.
- The list gets stale quickly. Regenerate it before each major run and record the date.
- Do not run code from these repos. Only `git clone --depth 1` and `oxlint`.
