# Third-party notices

This project includes material from the projects listed below.

## Next.js

Source: https://github.com/vercel/next.js

What is included:

- Rule messages in `src/rules/` adapted from the error and warning text in `packages/next/src/server/use-cache/use-cache-messages.ts` and `packages/next/src/server/web/spec-extension/revalidate.ts`.
- The dynamic route test in `src/rules/require-revalidate-path-type.ts`, which mirrors `isDynamicRoute` in `packages/next/src/shared/lib/router/utils/is-dynamic.ts`.
- The `cacheLife` profile values in `src/utils/cache-life.ts`, taken from `packages/next/src/server/config-shared.ts`.
- Snapshots of the two message sources in `scripts/next-sync/snapshot/`, used to detect upstream changes. They are not part of the published package.
- Test fixtures in `tests/fixtures/next/`, derived from `test/e2e/app-dir/` at commit `4b97b5e49357077bdf2cd85f8c0660e6a1a3417c`, with comment lines removed. They are not part of the published package.

License:

```text
The MIT License (MIT)

Copyright (c) 2025 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
