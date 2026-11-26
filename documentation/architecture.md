# Architecture

## Package layout

```
oxlint-plugin-cache-components/                 # repo
├── AGENTS.md
├── documentation/                       # these docs (internal planning)
├── docs/rules/<rule>.md                 # public docs per rule (English), linked from meta.docs.url
├── src/
│   ├── index.ts                         # eslintCompatPlugin({ meta, rules, configs })
│   ├── configs.ts                       # oxlint presets (recommended, strict, all) + flat/recommended for ESLint
│   ├── rules/
│   │   ├── no-request-api-in-cache.ts
│   │   ├── no-cache-api-outside-cache.ts
│   │   ├── require-cachelife-when-nested.ts
│   │   ├── no-invalid-cache-nesting.ts
│   │   ├── valid-invalidation-context.ts
│   │   ├── no-promise-args-to-cache.ts
│   │   ├── require-revalidate-tag-profile.ts
│   │   ├── require-revalidate-path-type.ts
│   │   └── require-auth-before-revalidate.ts
│   └── utils/
│       ├── analysis.ts                  # per-file analysis, cached (FileAnalysis)
│       ├── directives.ts                # file and function directives
│       ├── next-bindings.ts             # bindings imported from next/* and react
│       ├── contexts.ts                  # file kind and context of each function
│       ├── call-graph.ts                # intra-file call graph (+ JSX)
│       ├── cache-life.ts                # profile table and parsing of cacheLife(...)
│       └── messages.ts                  # docs URLs and message builders
├── tests/
│   ├── rules/<rule>.test.ts             # RuleTester
│   └── utils/*.test.ts
├── conformance/next-app/                # Next 16.4 app that confirms each error at runtime
├── scripts/
│   ├── corpus/run.mjs                   # clones and lints the corpus, aggregates results
│   ├── corpus/triage.md                 # manual TP/FP log per finding
│   └── next-sync.mjs                    # compares canary use-cache-messages.ts and revalidate.ts with a snapshot
├── skills/install-cache-components/SKILL.md   # skill for skills.sh (see spec.md)
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── oxlint.config.ts                     # the repo lints itself
```

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
  "engines": { "node": ">=20.19.0" },
  "peerDependencies": { "oxlint": ">=1.95.0" },
  "peerDependenciesMeta": { "oxlint": { "optional": true } },   // optional, for ESLint users
  "dependencies": { "@oxlint/plugins": "^1.95.0" },
  "devDependencies": { "oxlint": "1.95.0", "vitest": "…", "tsdown": "…", "typescript": "…", "eslint": "^9" }
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

The result is memoized per `Program` node. **Unverified:** whether oxlint passes the same AST object to every rule in a file. If it does not, each rule recomputes the analysis. That is O(n) and should not be a problem, but it needs measuring.

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

- In ESTree, a directive is an `ExpressionStatement` with a `directive` property (string) at the start of `Program.body` or of a function's body `BlockStatement`. **Unverified:** confirm with `RuleTester` in task M1.
- Only prologues count: the directive must come before any other statement.
- Double and single quotes are equivalent. Spaces after `:` are normalized. It is **Unverified** whether Next accepts `'use cache:remote'` without a space. If Next does not accept it, the directive is not recognized.
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
- Older versions of `next/cache` also export `unstable_cacheLife` and `unstable_cacheTag`. They are recognized as aliases. **Unverified:** that they are recognized as aliases.

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

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } }); // "tsx": Unverified; if it does not exist, use "ts" + jsx

tester.run("cache-components/no-request-api-in-cache", noRequestApiInCache, {
  valid: [/* … */],
  invalid: [{ name: "cookies in use cache", code: "…", errors: [{ messageId: "requestApi" }] }],
});
```

- Every valid and invalid example in `rules/<rule>.md` is a test. If you add a test that is not in the specification, add it to the specification too.
- To control `context.filename` (route.ts, page.tsx, proxy.ts), RuleTester accepts `filename` per case. **Unverified** in oxlint; it exists in ESLint.
- The utils (`directives`, `next-bindings`, `contexts`, `call-graph`, and `cache-life`) have their own tests. They use `RuleTester` with a test rule that serializes the analysis into the message.
- Coverage: 100% of messageIds and suggestions.

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
2. Run `git clone --depth 1 --filter=blob:none` into `.corpus/<owner>__<repo>` (listed in `.gitignore`). **It installs no dependencies and runs no code from the repos.**
3. Run `oxlint -c scripts/corpus/oxlintrc.json --format json <repo>` with a config that enables **only** our plugin, using the `all` preset.
4. Aggregate by rule and by messageId: number of findings, files, and repos.
5. Write `scripts/corpus/results/<date>.json` and a summary in Markdown.

#### Triage (`scripts/corpus/triage.md`)

For each finding, write one line: `repo | file:line | rule | messageId | TP/FP/unsure | note`. Reviewing a sample of up to 30 per rule is enough. Then extrapolate.

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

- `lint` (oxlint on this repo), `typecheck`, `test`, and `build`.
- `oxlint` matrix: the minimum supported version (1.95.0) and `latest`.
- ESLint 9 smoke test: loads `flat/recommended` and lints 3 fixtures ([ADR-002](decisions.md#adr-002-eslint-compatibility-as-a-secondary-target-best-effort)).
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
