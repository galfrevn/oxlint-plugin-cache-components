# Changelog

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
