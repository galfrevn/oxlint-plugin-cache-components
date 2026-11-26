import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = join(ROOT, "conformance/next-app");
const CASES = join(ROOT, "conformance/cases");
const NEXT = join(APP, "node_modules/next/dist/bin/next");
const OXLINT = join(
  dirname(createRequire(import.meta.url).resolve("oxlint/package.json")),
  "bin",
  "oxlint",
);
const LINT_CONFIG = join(ROOT, "tests/fixtures/configs/preset.config.ts");
const BUILD_TIMEOUT_MS = 180_000;
const SERVER_TIMEOUT_MS = 30_000;
const PORT = 4173;

const { values } = parseArgs({
  options: { case: { type: "string" } },
});

const names = (await readdir(CASES))
  .filter((name) => !values.case || name === values.case)
  .toSorted();
const results = await names.reduce(
  async (previous, name) => [...(await previous), await runCase(name)],
  Promise.resolve([]),
);

const report = renderReport(results);
await writeFile(join(ROOT, "conformance/RESULTS.md"), report);
console.log(report);
process.exit(results.some((result) => !result.passed) ? 1 : 0);

async function runCase(name) {
  const spec = JSON.parse(await readFile(join(CASES, name, "case.json"), "utf8"));
  await rm(join(APP, "app"), { recursive: true, force: true });
  await rm(join(APP, ".next"), { recursive: true, force: true });
  await mkdir(join(APP, "app"), { recursive: true });
  await cp(join(APP, "layout.jsx"), join(APP, "app/layout.jsx"));
  await cp(join(CASES, name, "app"), join(APP, "app"), { recursive: true });

  const rules = await lint(join(CASES, name));
  const build = await run(process.execPath, [NEXT, "build"], BUILD_TIMEOUT_MS);
  let output = build.output;
  let status = null;
  if (spec.request && build.code === 0) {
    const served = await serve(spec.request);
    output += served.output;
    status = served.status;
  }

  const nextjs = describeNext(spec, build, status, output);
  const lintMatches = spec.rule ? rules.includes(spec.rule) : rules.length === 0;
  const passed = spec.expect === "observe" || (nextjs.matches && lintMatches);
  console.log(
    `${passed ? "pass" : "FAIL"} ${name}: ${nextjs.summary}; plugin: ${rules.join(", ") || "none"}`,
  );
  return { name, spec, passed, rules, nextjs, excerpt: excerpt(output, spec.output) };
}

function describeNext(spec, build, status, output) {
  const found = spec.output ? output.includes(spec.output) : false;
  const outcome = build.timedOut
    ? "build timed out"
    : build.code === 0
      ? `build passed${status === null ? "" : `, request returned ${status}`}`
      : "build failed";
  switch (spec.expect) {
    case "error":
      return {
        matches: found && (build.code !== 0 || status !== null),
        summary: `${outcome}${found ? ", expected message found" : ", expected message missing"}`,
      };
    case "warning":
      return {
        matches: found && build.code === 0,
        summary: `${outcome}${found ? ", expected warning found" : ", expected warning missing"}`,
      };
    case "valid":
      return {
        matches: build.code === 0 && (status === null || status < 400),
        summary: outcome,
      };
    default:
      return { matches: true, summary: outcome };
  }
}

async function lint(cwd) {
  const { output } = await run(
    process.execPath,
    [OXLINT, "-c", LINT_CONFIG, "--format", "json", "app"],
    BUILD_TIMEOUT_MS,
    cwd,
  );
  const json = JSON.parse(output.slice(output.indexOf("{")));
  return [
    ...new Set(
      json.diagnostics
        .filter((diagnostic) => diagnostic.code?.startsWith("cache-components("))
        .map((diagnostic) => diagnostic.code.slice("cache-components(".length, -1)),
    ),
  ].toSorted();
}

async function serve(request) {
  const server = spawn(process.execPath, [NEXT, "start", "-p", String(PORT)], {
    cwd: APP,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const url = `http://localhost:${PORT}${request.path}`;
  const status = await waitForResponse(url, request.method);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  return { status, output };
}

async function waitForResponse(url, method, deadline = Date.now() + SERVER_TIMEOUT_MS) {
  try {
    const response = await fetch(url, { method, headers: { cookie: "theme=dark; cart=1" } });
    await response.text();
    return response.status;
  } catch {
    if (Date.now() > deadline) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    return waitForResponse(url, method, deadline);
  }
}

function run(command, args, timeoutMs, cwd = APP) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
    });
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}

function excerpt(output, expected) {
  const lines = output.split("\n");
  const index = expected ? lines.findIndex((line) => line.includes(expected)) : -1;
  const line =
    index >= 0
      ? lines[index]
      : lines.find(
          (candidate) => /error|warn/i.test(candidate) && !/eslint|telemetry/i.test(candidate),
        );
  return (line ?? "").replaceAll("|", "\\|").trim().slice(0, 240);
}

function renderReport(entries) {
  const rows = entries.map(
    ({ name, spec, passed, rules, nextjs, excerpt: line }) =>
      `| \`${name}\` | ${spec.expect} | ${nextjs.summary} | ${rules.map((rule) => `\`${rule}\``).join(", ") || "none"} | ${spec.expect === "observe" ? "observed" : passed ? "pass" : "fail"} | ${line ? `\`${line.replaceAll("`", "'")}\`` : ""} |`,
  );
  return [
    "# Conformance results",
    "",
    `Generated by \`pnpm conformance\` on ${new Date().toISOString().slice(0, 10)} with Next.js ${nextVersion()} and \`cacheComponents: true\`. Each case in \`conformance/cases/\` is built with \`next build\`, and cases with a request are started with \`next start\` and requested once.`,
    "",
    "| Case | Expected | Next.js | Plugin | Result | Output |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function nextVersion() {
  return createRequire(join(APP, "package.json"))("next/package.json").version;
}
