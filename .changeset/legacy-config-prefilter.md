---
"oxlint-plugin-cache-components": patch
---

Make `no-legacy-segment-config` skip files outside route segments before oxlint sends their AST to JavaScript, instead of analyzing every file that mentions `runtime`, `dynamic`, or `revalidate`.
