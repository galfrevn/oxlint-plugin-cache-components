---
"oxlint-plugin-cache-components": patch
---

Skip more files before oxlint sends their AST to JavaScript. Every rule except `no-legacy-segment-config` now requires the file to mention `next/cache` or `"use cache"`, instead of any `next/` import such as `next/link`. Files that the new check skips could not produce a report.
