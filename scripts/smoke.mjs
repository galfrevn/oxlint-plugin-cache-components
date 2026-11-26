import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_FINDINGS = 10;

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const bin = join(dirname(require.resolve("oxlint/package.json")), "bin", "oxlint");
const config = join(root, "tests/fixtures/configs/manual.json");

let output;
try {
  output = execFileSync(process.execPath, [bin, "-c", config, "--format", "json", "."], {
    cwd: join(root, "tests/fixtures/app"),
    encoding: "utf8",
  });
} catch (error) {
  output = error.stdout;
}

const findings = JSON.parse(output).diagnostics.filter((diagnostic) =>
  diagnostic.code.startsWith("cache-components("),
);

if (findings.length !== EXPECTED_FINDINGS) {
  console.error(
    `Expected ${EXPECTED_FINDINGS} findings on Node ${process.version}, got ${findings.length}.`,
  );
  process.exit(1);
}

console.log(`The plugin reported ${findings.length} findings on Node ${process.version}.`);
