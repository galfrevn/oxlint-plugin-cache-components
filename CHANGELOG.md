# Changelog

## 0.2.2

### Patch Changes

- f8ab91d: Fix the file analysis taking quadratic time in the number of identifiers in one function. Each lookup scanned every reference of the scope, so a large Server Action or cached function could stall oxlint for seconds. Lookups now use an index built once per scope.
- 3826325: Skip more files before oxlint sends their AST to JavaScript. Every rule except `no-legacy-segment-config` now requires the file to mention `next/cache` or `"use cache"`, instead of any `next/` import such as `next/link`. Files that the new check skips could not produce a report.

## 0.2.1

### Patch Changes

- ecfff22: Fix `require-auth-before-revalidate` taking exponential time in the number of branches, such as `?.`, `??`, `&&`, or `if`, between the auth check and the invalidation. A large Server Action could stall oxlint for minutes. The check now takes linear time in the size of the function.
- 63f2614: Stop the `all` preset from setting `cacheComponents: true` for `no-legacy-segment-config`, which reported valid segment config exports in projects without Cache Components. Extend `migration` as well to check them.
- 1dcaf4f: Make `no-legacy-segment-config` skip files outside route segments before oxlint sends their AST to JavaScript, instead of analyzing every file that mentions `runtime`, `dynamic`, or `revalidate`.
- c58703c: Stop `no-react-cache-across-boundary` from reporting a `React.cache` call in a component or helper that runs only inside cached functions, such as a component rendered only from a `"use cache"` function.
- 4ba0b13: Recognize `const` aliases of Next.js APIs and of `requestApis` entries, such as `const read = cookies`, in every rule.
- 8bfda93: Link each rule's `docs.url` to the docs of the installed version, on its git tag, instead of the `main` branch.

## 0.2.0

### Minor Changes

- aeea436: Add `no-legacy-segment-config` with a `migration` preset, and add `no-introspect-passthrough`, `serializable-cache-args`, and `no-react-cache-across-boundary` to `strict` as warnings. `require-auth-before-revalidate` now uses code path analysis, so an auth check counts only when it runs on every path before the invalidation.

## 0.1.0

Initial version.

### Rules

- `no-request-api-in-cache`: request-time APIs inside cache scopes, directly and through helpers in the same file.
- `no-cache-api-outside-cache`: `cacheTag()` and `cacheLife()` where no cache scope exists.
- `require-cachelife-when-nested`: a cached function without `cacheLife()` that calls a short-lived cached function.
- `no-invalid-cache-nesting`: `"use cache: private"` inside a public cache, `unstable_cache()`, or a build-time generator.
- `valid-invalidation-context`: `revalidateTag()`, `revalidatePath()`, `updateTag()`, and `refresh()` where Next.js rejects them.
- `no-promise-args-to-cache`: request-time promises passed to, or captured by, cached functions without `await`.
- `require-revalidate-tag-profile`: `revalidateTag()` with one argument.
- `require-revalidate-path-type`: `revalidatePath()` with a dynamic route and no `type`.
- `require-auth-before-revalidate`: cache invalidation in a Server Action or Route Handler without an auth check.

### Configuration

- oxlint presets `recommended`, `strict`, and `all` from `oxlint-plugin-cache-components/configs`.
- ESLint flat configs `flat/recommended`, `flat/strict`, and `flat/all`.
- Shared options in `settings["cache-components"]`: `requestApis`, `appDir`, `shortProfiles`, `authFunctions`, and `authWrappers`.

### Agent integration

- The `install-cache-components` skill, with post-edit hook recipes.
