---
"oxlint-plugin-cache-components": patch
---

Stop `require-auth-before-revalidate` from reporting an invalidation inside a callback when the auth check runs before the callback is created, such as `await requireSession()` followed by `await Promise.resolve().then(() => updateTag("jobs"))`, or an invalidation inside nested Effect callbacks.
