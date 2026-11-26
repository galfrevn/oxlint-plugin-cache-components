---
"oxlint-plugin-cache-components": patch
---

Stop `no-react-cache-across-boundary` from reporting a `React.cache` call in a component or helper that runs only inside cached functions, such as a component rendered only from a `"use cache"` function.
