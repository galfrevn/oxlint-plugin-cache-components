import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ALLOWED = [
  /^dist\//,
  /^docs\/rules\/[\w-]+\.md$/,
  /^(CHANGELOG\.md|LICENSE|README\.md|THIRD_PARTY_NOTICES\.md|package\.json)$/,
];
const REQUIRED = [
  "dist/index.js",
  "dist/configs.js",
  "dist/index.d.ts",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
];

const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  encoding: "utf8",
});
const files = JSON.parse(output)[0].files.map((file) => file.path);
const unexpected = files.filter((file) => !ALLOWED.some((pattern) => pattern.test(file)));
const missing = REQUIRED.filter((file) => !files.includes(file));

if (unexpected.length > 0 || missing.length > 0) {
  console.error(`Unexpected files: ${unexpected.join(", ") || "none"}`);
  console.error(`Missing files: ${missing.join(", ") || "none"}`);
  process.exit(1);
}

console.log(`The package contains ${files.length} files.`);
