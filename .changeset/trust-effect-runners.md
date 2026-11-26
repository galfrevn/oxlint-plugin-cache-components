---
"oxlint-plugin-cache-components": patch
---

Make `trustAwaitedCalls` in `require-auth-before-revalidate` also trust an awaited Effect runner, `runPromise` or `runPromiseExit`, whose argument is a call to an imported or local function, such as `await serverRuntime.runPromise(unsubscribeWithToken(token))`. The rule now treats it like `await unsubscribeWithToken(token)`.
