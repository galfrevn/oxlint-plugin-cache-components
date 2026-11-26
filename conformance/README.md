# Conformance app

Each case in `cases/` reproduces one rule against a real Next.js build. `pnpm conformance` copies the case into `next-app/app`, runs `next build`, and, when `case.json` has a `request`, starts the app and sends it. A case passes when Next.js produces the expected output and the plugin reports the expected rule, or, for a `valid` case, when the app builds and serves without errors and the plugin reports nothing.

`case.json` fields:

- `expect`: `error`, `warning`, `valid`, or `observe`. An `observe` case records the outcome without failing, for questions that are not settled yet.
- `rule`: the rule that must report the case.
- `output`: text that must appear in the build or server output.
- `request`: `{ "method", "path" }` to send after `next start`.

The `promise-arg-captured` case is derived from the `bound-args` fixture in `test/e2e/app-dir/use-cache-hanging-inputs` of Next.js (MIT, see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)). The latest results are in [`RESULTS.md`](RESULTS.md).
