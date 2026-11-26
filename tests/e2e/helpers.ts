import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const run = promisify(execFile);

export const FIXTURES: string = fileURLToPath(new URL("../fixtures", import.meta.url));

export interface Finding {
  readonly severity: string;
  readonly location: string;
  readonly rule: string;
}

interface OxlintJson {
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: string;
    readonly filename: string;
    readonly labels: readonly { readonly span: { readonly line: number } }[];
  }[];
}

export async function runOxlint(cwd: string, args: readonly string[]): Promise<string> {
  const bin = join(dirname(require.resolve("oxlint/package.json")), "bin", "oxlint");
  try {
    const { stdout } = await run(process.execPath, [bin, ...args], { cwd });
    return stdout;
  } catch (error) {
    const { stdout } = error as { stdout?: string };
    if (typeof stdout === "string" && stdout.length > 0) {
      return stdout;
    }
    throw error;
  }
}

export function parseFindings(output: string): Finding[] {
  const json = JSON.parse(output) as OxlintJson;
  return json.diagnostics
    .filter((diagnostic) => diagnostic.code.startsWith("cache-components("))
    .map((diagnostic) => ({
      severity: diagnostic.severity,
      location: `${diagnostic.filename}:${diagnostic.labels[0]?.span.line ?? 0}`,
      rule: diagnostic.code.slice("cache-components(".length, -1),
    }))
    .toSorted((a, b) => `${a.location} ${a.rule}`.localeCompare(`${b.location} ${b.rule}`));
}
