---
"oxlint-plugin-cache-components": minor
---

Add `no-legacy-segment-config` with a `migration` preset, and add `no-introspect-passthrough`, `serializable-cache-args`, and `no-react-cache-across-boundary` to `strict` as warnings. `require-auth-before-revalidate` now uses code path analysis, so an auth check counts only when it runs on every path before the invalidation.
