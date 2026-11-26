import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS_DIR = join(ROOT, ".corpus");
const RESULTS_DIR = join(ROOT, "scripts/corpus/results");
const OXLINT = join(dirname(require.resolve("oxlint/package.json")), "bin", "oxlint");
const PLUGIN = join(ROOT, "dist/index.js");
const PLUGIN_CRASH = "Error running JS plugin";

const { values } = parseArgs({
  options: {
    limit: { type: "string", default: "60" },
    baseline: { type: "boolean", default: false },
    "max-ratio": { type: "string" },
    quiet: { type: "boolean", default: false },
  },
});

const maxRatio = values["max-ratio"] === undefined ? null : Number(values["max-ratio"]);
if (maxRatio !== null && !(maxRatio > 0)) {
  console.error("--max-ratio must be a positive number.");
  process.exit(1);
}
const measureBaseline = values.baseline || maxRatio !== null;

if (!existsSync(PLUGIN)) {
  console.error("dist/index.js is missing. Run `pnpm build` first.");
  process.exit(1);
}

const { default: plugin } = await import(PLUGIN);
const { all } = await import(join(ROOT, "dist/configs.js"));
const messageMatchers = buildMessageMatchers(plugin.rules);

await mkdir(CORPUS_DIR, { recursive: true });
const configPath = join(CORPUS_DIR, "oxlintrc.json");
const baselinePath = join(CORPUS_DIR, "baseline.json");
const emptyPluginPath = join(CORPUS_DIR, "empty-plugin.mjs");
const emptyConfigPath = join(CORPUS_DIR, "empty-plugin.json");
await writeFile(
  configPath,
  JSON.stringify({
    categories: { correctness: "off" },
    jsPlugins: all.jsPlugins,
    rules: all.rules,
  }),
);
await writeFile(baselinePath, "{}");
await writeFile(
  emptyPluginPath,
  'export default { meta: { name: "empty" }, rules: { rule: { createOnce() { return { Program() {} }; } } } };\n',
);
await writeFile(
  emptyConfigPath,
  JSON.stringify({
    categories: { correctness: "off" },
    jsPlugins: [emptyPluginPath],
    rules: { "empty/rule": "error" },
  }),
);

const repos = await selectRepos(Number(values.limit));
const results = await sequence(repos, async (repo) => {
  const checkout = join(CORPUS_DIR, repo.repo.replace("/", "__"));
  if (!(await clone(repo.repo, checkout))) {
    return { ...repo, error: "clone failed", findings: [], crashes: [], parseErrors: 0 };
  }
  const lint = await lintRepo(checkout, configPath);
  const baseline = measureBaseline ? await lintRepo(checkout, baselinePath) : null;
  const emptyPlugin = measureBaseline ? await lintRepo(checkout, emptyConfigPath) : null;
  if (!values.quiet) {
    console.log(
      `${repo.repo}: ${lint.findings.length} findings in ${Math.round(lint.durationMs)} ms`,
    );
  }
  return {
    ...repo,
    durationMs: lint.durationMs,
    baselineMs: baseline?.durationMs ?? null,
    emptyPluginMs: emptyPlugin?.durationMs ?? null,
    error: lint.error,
    findings: lint.findings,
    crashes: lint.crashes,
    parseErrors: lint.parseErrors,
  };
});

const date = new Date().toISOString().slice(0, 10);
const summary = summarize(results);
await mkdir(RESULTS_DIR, { recursive: true });
await writeFile(
  join(RESULTS_DIR, `${date}.json`),
  `${JSON.stringify({ date, version: plugin.meta.version, summary, repos: results }, null, 2)}\n`,
);
await writeFile(join(RESULTS_DIR, `${date}.md`), renderMarkdown(date, summary, results));
console.log(`Wrote scripts/corpus/results/${date}.json and ${date}.md`);
console.log(describeTiming(summary));

if (maxRatio !== null) {
  const failures = checkLimits(summary, maxRatio);
  for (const failure of failures) {
    console.error(failure);
  }
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function checkLimits(totals, limit) {
  const failures = [];
  const ratio = emptyPluginRatio(totals);
  if (ratio === null) {
    failures.push("No repository was timed with the empty JS plugin.");
  } else if (ratio > limit) {
    failures.push(
      `The plugin took ${ratio.toFixed(2)} times as long as an empty JS plugin, above the limit of ${limit}.`,
    );
  }
  if (totals.crashes.length > 0) {
    failures.push(`The plugin crashed on ${totals.crashes.length} files.`);
  }
  return failures;
}

function emptyPluginRatio(totals) {
  return totals.emptyPluginMs ? totals.lintMs / totals.emptyPluginMs : null;
}

function describeTiming(totals) {
  const ratio = emptyPluginRatio(totals);
  return totals.baselineMs === null || ratio === null
    ? `The plugin took ${totals.lintMs} ms in total.`
    : `The plugin took ${totals.lintMs} ms in total. oxlint with its default config took ${totals.baselineMs} ms, and with an empty JS plugin ${totals.emptyPluginMs} ms (ratio to the empty plugin: ${ratio.toFixed(2)}).`;
}

async function sequence(items, task) {
  const output = [];
  await items.reduce(async (previous, item) => {
    await previous;
    output.push(await task(item));
  }, Promise.resolve());
  return output;
}

async function selectRepos(limit) {
  const tsv = await readFile(join(ROOT, "scripts/corpus/repositories.tsv"), "utf8");
  const rows = tsv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [stars, repo, , , , license, role] = line.split("\t");
      return { repo, stars: Number(stars), license, role };
    });
  const measured = rows
    .filter((row) => row.role === "corpus")
    .toSorted((a, b) => b.stars - a.stars)
    .slice(0, limit);
  return [...measured, ...rows.filter((row) => row.role === "corpus-vercel-template")];
}

async function clone(repo, checkout) {
  if (existsSync(checkout)) {
    return true;
  }
  try {
    await run(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--quiet",
        `https://github.com/${repo}.git`,
        checkout,
      ],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 64 * 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

async function lintRepo(checkout, config) {
  const args = [OXLINT, "-c", config, "--disable-nested-config", "--format", "json", checkout];
  const start = performance.now();
  let stdout = "";
  let error = null;
  try {
    ({ stdout } = await run(process.execPath, args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }));
  } catch (failure) {
    stdout = failure.stdout ?? "";
    error = stdout ? null : String(failure.stderr ?? failure.message).slice(0, 500);
  }
  const durationMs = performance.now() - start;
  const diagnostics = stdout ? JSON.parse(stdout).diagnostics : [];
  const crashes = diagnostics
    .filter((diagnostic) => !diagnostic.code && diagnostic.message.startsWith(PLUGIN_CRASH))
    .map((diagnostic) => ({
      file: relative(checkout, join(ROOT, diagnostic.filename)),
      message: diagnostic.message.split("\n").slice(0, 3).join(" "),
    }));
  const parseErrors = diagnostics.filter(
    (diagnostic) => !diagnostic.code && !diagnostic.message.startsWith(PLUGIN_CRASH),
  ).length;
  const findings = diagnostics
    .filter((diagnostic) => diagnostic.code?.startsWith("cache-components("))
    .map((diagnostic) => {
      const rule = diagnostic.code.slice("cache-components(".length, -1);
      return {
        rule,
        messageId: matchMessageId(rule, diagnostic.message),
        file: relative(checkout, join(ROOT, diagnostic.filename)),
        line: diagnostic.labels[0]?.span.line ?? 0,
        message: diagnostic.message,
      };
    });
  return { durationMs, findings, crashes, parseErrors, error };
}

function buildMessageMatchers(rules) {
  const matchers = {};
  for (const [name, rule] of Object.entries(rules)) {
    matchers[name] = Object.entries(rule.meta?.messages ?? {}).map(([messageId, template]) => {
      const pattern = template
        .split(/\{\{\s*\w+\s*\}\}/)
        .map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
        .join("[\\s\\S]*?");
      return { messageId, pattern: new RegExp(`^${pattern}$`) };
    });
  }
  return matchers;
}

function matchMessageId(rule, message) {
  return (
    messageMatchers[rule]?.find(({ pattern }) => pattern.test(message))?.messageId ?? "unknown"
  );
}

function summarize(entries) {
  const byRule = {};
  for (const result of entries) {
    for (const finding of result.findings) {
      const key = `${finding.rule}/${finding.messageId}`;
      const entry = (byRule[key] ??= { findings: 0, files: new Set(), repos: new Set() });
      entry.findings += 1;
      entry.files.add(`${result.repo}/${finding.file}`);
      entry.repos.add(result.repo);
    }
  }
  const lintMs = entries.reduce((total, result) => total + (result.durationMs ?? 0), 0);
  const baselineMs = entries.reduce((total, result) => total + (result.baselineMs ?? 0), 0);
  const emptyPluginMs = entries.reduce((total, result) => total + (result.emptyPluginMs ?? 0), 0);
  return {
    repos: entries.length,
    failed: entries.filter((result) => result.error).map((result) => result.repo),
    crashes: entries.flatMap((result) =>
      result.crashes.map((crash) => ({ repo: result.repo, ...crash })),
    ),
    lintMs: Math.round(lintMs),
    baselineMs: baselineMs > 0 ? Math.round(baselineMs) : null,
    emptyPluginMs: emptyPluginMs > 0 ? Math.round(emptyPluginMs) : null,
    byRule: Object.fromEntries(
      Object.entries(byRule)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [
          key,
          { findings: entry.findings, files: entry.files.size, repos: entry.repos.size },
        ]),
    ),
  };
}

function renderMarkdown(runDate, totals, entries) {
  const rows = Object.entries(totals.byRule).map(
    ([key, entry]) => `| \`${key}\` | ${entry.findings} | ${entry.files} | ${entry.repos} |`,
  );
  const findings = entries.flatMap((result) =>
    result.findings.map(
      (finding) =>
        `| ${result.repo} | \`${finding.file}:${finding.line}\` | \`${finding.rule}\` | \`${finding.messageId}\` |`,
    ),
  );
  const timing = describeTiming(totals);
  return [
    `# Corpus run ${runDate}`,
    "",
    `Linted ${totals.repos} repositories with the \`all\` preset. ${timing}`,
    totals.failed.length > 0 ? `\nFailed to lint: ${totals.failed.join(", ")}.` : "",
    `\nPlugin errors: ${totals.crashes.length}.`,
    ...totals.crashes.map((crash) => `- ${crash.repo} \`${crash.file}\`: ${crash.message}`),
    "",
    "## Findings by rule",
    "",
    "| Rule / message | Findings | Files | Repos |",
    "|---|---|---|---|",
    ...(rows.length > 0 ? rows : ["| none | 0 | 0 | 0 |"]),
    "",
    "## Findings",
    "",
    "| Repo | Location | Rule | Message |",
    "|---|---|---|---|",
    ...findings,
    "",
  ].join("\n");
}
