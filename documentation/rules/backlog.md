# Rule backlog (v0.2)

Rules planned for v0.2. Each rule moves to its own file in this folder when its implementation starts.

## `cache-components/no-legacy-segment-config`

**v0.2 · preset: `migration` (error) · type: problem · fix: no · suggestions: yes**

### Summary

With `cacheComponents` enabled, reports route segment config exports that are incompatible with Cache Components in App Router files: `dynamic`, `revalidate`, `fetchCache`, `runtime`, and `experimental_ppr`.

### Rationale

Guide "Migrating to Cache Components":

- "After enabling the flag, route segments that still export `dynamic`, `revalidate`, or `fetchCache` will error."
- `runtime`: "Cache Components requires the Node.js runtime… does not support the `runtime` route segment config. Remove the export even when it is set to `runtime = 'nodejs'`."
- `experimental_ppr`: "Next.js 16 removes… the `experimental_ppr` route segment config."

Next already errors in dev and at build, so the value of this rule is catching the problem earlier: in the editor and in the agent hook. It is the most common expected agent mistake, because `export const revalidate = 60` appears throughout the training code written before Next 16.

#### Why it is not in `recommended`

The rule is only correct when `cacheComponents: true`, and a per-file plugin cannot read `next.config`. For that reason it requires the option explicitly.

### Detection

1. Only in segment files (`page`, `layout`, `route`, `template`, `default`) inside `appDir`.
2. `ExportNamedDeclaration` → `VariableDeclaration` with the id `dynamic`, `revalidate`, `fetchCache`, `runtime`, or `experimental_ppr`. Also `export { revalidate }` re-exported from a local `const`.
3. Only if the `cacheComponents` option is `true`. **Unverified:** whether to auto-detect by reading `next.config.*` with `fs` once per process. That is impure and fragile, so the decision is planned for v0.2.

### Fixes and suggestions

These follow the migration guide.

| Export | Suggestion |
|---|---|
| `dynamic = "force-dynamic"` | remove the export |
| `dynamic = "force-static"` | remove, and add `"use cache"` (with a comment asking to review `cacheLife`) |
| `dynamic = "error"` | remove (with a comment suggesting `ensureStatic = "navigation"`, Next ≥16.4) |
| `revalidate = N` | remove, and suggest `cacheLife("<closest profile>")` inside a `"use cache"`; `revalidate = 0` → remove only |
| `fetchCache` | remove |
| `runtime` | remove |
| `experimental_ppr` | remove |

### Options

```ts
type Options = [{ cacheComponents: boolean; appDir?: string[] }]; // no default: if not configured, the rule does nothing and warns once
```

### Messages

- `legacyConfig`: ``` `export const {{name}}` isn't supported with Cache Components. {{hint}} See https://nextjs.org/docs/app/guides/migrating-to-cache-components ```

### Tests

- [ ] Each export in `page.tsx`, `layout.tsx`, and `route.ts` → error with `cacheComponents: true`; without the option → valid.
- [ ] Same export in `lib/config.ts` → valid.
- [ ] Mapping of `revalidate` to a profile (60 → `minutes`, 3600 → `hours`, …).

## `cache-components/no-introspect-passthrough`

**v0.2 · preset: `strict` (warn) · type: problem · fix: no · suggestions: no**

### Summary

Inside a cached function or component, reports when a non-serializable value received as an argument is **introspected**: reading or transforming `children` (or props used as JSX slots), or **calling** a function received as an argument.

### Rationale

`use cache` docs: "You can accept non-serializable values as long as you don't introspect them. Don't read or modify children - just pass it through; Don't call action here - just pass it through."

**Unverified:** the exact failure mode in the conformance app (a runtime error or incorrect behavior). Until it is confirmed, the rule stays `warn` in `strict`.

### Detection

In functions with `CacheScope`:

1. Candidate parameters: `children` and destructured props whose annotated type is `ReactNode`, `ReactElement`, or `JSX.Element`. The check is textual, on the annotation only, without types.
2. Introspection of those parameters: `React.Children.*(x)`, `Children.*(x)`, `cloneElement(x)`, `isValidElement(x)`, `x.props`, `x.type`, `x.map(`, `typeof x`, or `Array.isArray(x)`.
3. Functions: any parameter (or destructured prop) that appears as the callee of a `CallExpression` inside the cached scope.
4. Using the value as `{children}` in JSX or passing it as a prop → valid (pass-through).

### Examples

```tsx
async function Card({ children }: { children: ReactNode }) {
  "use cache";
  const count = Children.count(children);   // invalid: introspects children
  return <div data-count={count}>{children}</div>;
}

async function Shell({ onLoad }: { onLoad: () => void }) {
  "use cache";
  onLoad();                                 // invalid: calls a function passed as an argument
}

async function Layout({ children, action }: Props) {
  "use cache";
  return <form action={action}>{children}</form>; // valid: pass-through
}
```

### False-positive risk

Medium: a parameter named `children` may actually be an array of data. For that reason, without a type annotation, only `children` in PascalCase components counts.

### Messages

- `introspectChildren`: ``` `{{name}}` is passed into {{scope}} as a reference. Pass it through without reading or transforming it; introspecting it inside a cached function isn't supported. See https://nextjs.org/docs/app/api-reference/directives/use-cache ```
- `callFunctionArg`: ``` `{{name}}` is a function passed into {{scope}} `{{fn}}`. Functions can be passed through a cached function but not called inside it. Call it outside, or pass its result as data. See https://nextjs.org/docs/app/api-reference/directives/use-cache ```

### Tests

- [ ] Each introspection pattern → warn.
- [ ] Pass-through in JSX and as a prop → valid.
- [ ] A module-level function (not a parameter) called inside → valid.

## `cache-components/serializable-cache-args`

**v0.2 · preset: `strict` (warn) · type: problem · fix: no · suggestions: no**

### Summary

At the call sites in the same file as cached functions or components, reports arguments that are **syntactically** non-serializable. No types are used: the rule only matches patterns visible in the AST.

### Rationale

`use cache` docs: "Arguments to cached functions and their return values must be serializable… Server Component serialization (for arguments) is more restrictive…". Unsupported types: "Class instances, Functions (except as pass-through), Symbols, WeakMaps, WeakSets, URL instances".

### Detection

An argument or JSX attribute that is:

- `new URL(...)`, `new WeakMap(...)`, `new WeakSet(...)`, `Symbol(...)`, or `Symbol.for(...)`.
- `new X(...)` where `X` is a class declared in the file or imported, **except** for the allowlist: `Date`, `Map`, `Set`, `Array`, `ArrayBuffer`, `DataView`, the typed arrays, `Promise` (which covers `no-promise-args-to-cache`), `Error` (unverified), and `FormData` (unverified).
- `this`.
- In Route Handlers: the identifier of the `request` or `req` parameter of an exported method, or `request.headers` (a `Headers` instance).

Functions (arrow or expression) are **not** reported. Pass-through is allowed, and calling them is covered by `no-introspect-passthrough`.

### Examples

```ts
await getPage(new URL(request.url));              // invalid: URL
await getData(request);                           // invalid: NextRequest
await getUser(new UserService(db));               // invalid: class instance
await getPosts(new Date(), new Map([["a", 1]]));  // valid: Date and Map are serializable
await getPage(request.nextUrl.pathname);          // valid: string
```

### False-positive risk

Low for the listed patterns. The `Error` and `FormData` allowlist entries must be verified against React's argument serialization.

### Messages

- `nonSerializable`: ``` `{{expr}}` can't be serialized as an argument to {{scope}} `{{fn}}` ({{reason}}). Pass plain data instead, such as strings, numbers or plain objects. See https://nextjs.org/docs/app/api-reference/directives/use-cache ```

`{{reason}}` ∈ "URL instance", "class instance", "Symbol", "WeakMap", "WeakSet", "Request object", "Headers object", "`this`".

### Tests

- [ ] Each case in the list above → warn.
- [ ] The allowlist → valid.
- [ ] A cached function from another file (not visible) → valid.

## `cache-components/no-react-cache-across-boundary`

**v0.2 · preset: `strict` (warn) · type: suggestion · fix: no · suggestions: no**

### Summary

Detects the "preload" pattern: a function wrapped in `React.cache` that is called **outside** a cache scope (to preload) and **inside** a cached function (to consume) in the same file. The result is not shared.

### Rationale

- `use cache` docs: "`React.cache` operates in an isolated scope inside `use cache` boundaries. Values stored via `React.cache` outside a `use cache` function are not visible inside it."
- Migration guide: "Calls from separate Cache Functions do not share a `React.cache` result… replace the React wrapper with `'use cache: private'`… If the function only needs request-scoped deduplication, use `cacheLife({ stale: Infinity })`".

This is not a runtime error. It is duplicated work, which is why the rule is `warn` in `strict`.

### Detection

1. `const f = cache(async (...) => …)` with `cache` imported from `react`.
2. In the same file, `f(...)` is called at least once outside any `CacheScope` and at least once inside one.
3. Report on the inside call.

### Example

```tsx
import { cache } from "react";
const getUser = cache(async (id: string) => db.user.find(id));

export default async function Page({ id }: { id: string }) {
  void getUser(id);                 // preload
  return <Profile id={id} />;
}

async function Profile({ id }: { id: string }) {
  "use cache";
  const user = await getUser(id);   // warn: does not see the preload result
  return <h1>{user.name}</h1>;
}
```

### Messages

- `isolated`: ``` `{{name}}` is wrapped in `React.cache`, but `React.cache` runs in an isolated scope inside {{scope}}, so the call on line {{line}} isn't shared here. To share request data across cached functions, use "use cache: private". See https://nextjs.org/docs/app/guides/migrating-to-cache-components ```

### Tests

- [ ] Preload outside plus consume inside → warn.
- [ ] Only inside or only outside → valid.
- [ ] `cache` imported from another library → valid.
