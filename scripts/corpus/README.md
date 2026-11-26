# Corpus

The corpus measures false positives on public repositories that use Cache Components. `pnpm corpus` builds the plugin, clones the repositories, lints them, and writes the findings to `scripts/corpus/results/`. The results stay on the machine that ran them, because they name files in third-party repositories.

## Repository list

[`repositories.tsv`](repositories.tsv) lists public repositories that use `"use cache"` or `cacheComponents`, found with GitHub code search. Forks and archived repositories are excluded. The columns are `stars`, `repo`, `pushed_at`, `archived`, `fork`, `license`, and `role`:

- `corpus`: linted to measure false positives.
- `corpus-vercel-template`: `vercel/shop`, always included in a run.
- `fixtures-only`: `vercel/next.js`. Its tests contain errors on purpose, so it is not measured.

To regenerate the list, run the searches below, then read `stars`, `archived`, and `fork` for each repository with `gh api repos/<owner>/<repo>`. GitHub code search returns at most 100 results per query, so the list is a sample.

```bash
for q in '"use cache" cacheLife language:TypeScript' '"use cache" cacheTag language:TypeScript' \
         '"use cache: private" language:TypeScript' '"use cache: remote" language:TypeScript' \
         'cacheComponents: true filename:next.config.ts' 'cacheComponents: true filename:next.config.mjs' \
         '"use cache" updateTag language:TypeScript' '"use cache" revalidateTag language:TypeScript'; do
  gh search code "$q" --limit 100 --json repository --jq '.[].repository.nameWithOwner'
done | sort -u
```

## Run

```bash
pnpm corpus --limit 60
pnpm corpus --limit 60 --baseline
pnpm corpus --limit 60 --max-ratio 2 --quiet
```

The runner takes the repositories with the most stars, plus `vercel/shop`, and clones each one with `git clone --depth 1` into `.corpus/`. It installs no dependencies and runs no code from the repositories. It lints them with the `all` preset, the options of the `migration` preset, and `--disable-nested-config`, so oxlint loads no configuration file from a cloned repository. `--baseline` also times oxlint with its default config and with an empty JS plugin.

`--max-ratio <n>` implies `--baseline`. The run exits with an error when the plugin takes more than `n` times as long as the empty JS plugin across all repositories, or when the plugin crashes on any file. `--quiet` prints only the totals, without a line per repository.

Diagnostics whose message starts with `Error running JS plugin` count as plugin errors. A run should have none.

## Triage

Review up to 30 findings per rule in the local results and mark each one as a true positive or a false positive. Record the counts, the false-positive rate, and the false-positive patterns in [`triage.md`](triage.md), without naming repositories that have confirmed bugs.

## Thresholds

The false-positive rate of a rule is FP / (TP + FP) on the reviewed sample.

| Preset | Maximum false-positive rate |
|---|---|
| `recommended` as `error` | 5% |
| `recommended` as `warn` | 15% |

A rule above its threshold is fixed or moved to `strict`. A full corpus run with the plugin must not take more than 2 times as long as the same run with an empty JS plugin. The `Corpus` workflow enforces this limit.

## Continuous run

The `Corpus` workflow in [`.github/workflows/corpus.yml`](../../.github/workflows/corpus.yml) runs `pnpm corpus --limit 60 --max-ratio 2 --quiet` every Monday, on manual dispatch, and on pull requests that change `src/`, `scripts/corpus/`, `package.json`, or `pnpm-lock.yaml`. The job fails above the time limit or on a plugin crash. It writes the totals and the findings by rule to the job summary, and leaves out the table of findings by file. It uploads no results.

## Reporting bugs to corpus repositories

Report only a confirmed true positive that reproduces against the Next.js docs or a conformance case. Open at most one issue or pull request per repository, and only with approval from the maintainer.
