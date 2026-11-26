---
"oxlint-plugin-cache-components": patch
---

Fix the file analysis taking quadratic time in the number of identifiers in one function. Each lookup scanned every reference of the scope, so a large Server Action or cached function could stall oxlint for seconds. Lookups now use an index built once per scope.
