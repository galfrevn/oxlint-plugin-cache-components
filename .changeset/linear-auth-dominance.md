---
"oxlint-plugin-cache-components": patch
---

Fix `require-auth-before-revalidate` taking exponential time in the number of branches, such as `?.`, `??`, `&&`, or `if`, between the auth check and the invalidation. A large Server Action could stall oxlint for minutes. The check now takes linear time in the size of the function.
