import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { FIXTURES, parseFindings, runOxlint } from "./helpers.ts";

interface Fixture {
  readonly file: string;
  readonly source: string;
  readonly nextjs: string;
  readonly expected: readonly { readonly rule: string; readonly line: number }[];
  readonly notReported?: string;
}

const ROOT = join(FIXTURES, "next");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as {
  readonly fixtures: readonly Fixture[];
};
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }
    return SOURCE_FILE.test(entry.name) ? [relative(ROOT, path)] : [];
  });
}

describe("fixtures derived from Next.js tests", async () => {
  const output = await runOxlint(ROOT, [
    "-c",
    join(FIXTURES, "configs", "preset.config.ts"),
    "--format",
    "json",
    ".",
  ]);
  const findings = parseFindings(output);

  it("lists every fixture in the manifest", () => {
    expect(listSourceFiles(ROOT).toSorted()).toEqual(
      MANIFEST.fixtures.map((fixture) => fixture.file).toSorted(),
    );
  });

  it("justifies every Next.js error that the plugin does not report", () => {
    const unjustified = MANIFEST.fixtures.filter(
      (fixture) =>
        !/^(Works|Prerenders)/.test(fixture.nextjs) &&
        fixture.expected.length === 0 &&
        !fixture.notReported,
    );
    expect(unjustified).toEqual([]);
  });

  it.each(MANIFEST.fixtures.map((fixture) => [fixture.file, fixture] as const))(
    "%s",
    (file, fixture) => {
      const actual = findings
        .filter((finding) => finding.location.startsWith(`${file}:`))
        .map((finding) => ({
          rule: finding.rule,
          line: Number(finding.location.split(":").at(-1)),
        }));
      expect(actual).toEqual(fixture.expected);
    },
  );
});
