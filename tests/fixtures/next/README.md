# Next.js fixtures

These files are derived from the test fixtures of [Next.js](https://github.com/vercel/next.js) at commit `4b97b5e49357077bdf2cd85f8c0660e6a1a3417c`, under the MIT license (see [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md)). Comment lines were removed. The code is otherwise unchanged, and each file keeps the `app/` path of its route.

[`manifest.json`](manifest.json) lists, for each file, its source path, what Next.js does with it, and what the plugin reports. When the plugin does not report a Next.js error, `notReported` gives the reason. `tests/e2e/next-fixtures.test.ts` runs the oxlint CLI on this directory and compares the findings with the manifest.
