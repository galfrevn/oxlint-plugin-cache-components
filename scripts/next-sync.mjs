import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const SOURCES = [
  "packages/next/src/server/use-cache/use-cache-messages.ts",
  "packages/next/src/server/web/spec-extension/revalidate.ts",
];

const SNAPSHOT_DIR = new URL("./next-sync/snapshot/", import.meta.url);

const { values } = parseArgs({
  options: {
    ref: { type: "string", default: "canary" },
    update: { type: "boolean", default: false },
  },
});

async function fetchSource(path) {
  const url = `https://raw.githubusercontent.com/vercel/next.js/${values.ref}/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function readSnapshot(target) {
  try {
    return await readFile(target, "utf8");
  } catch {
    return "";
  }
}

function lineDiff(before, after) {
  const beforeLines = new Set(before.split("\n").map((line) => line.trim()));
  const afterLines = new Set(after.split("\n").map((line) => line.trim()));
  const removed = [...beforeLines].filter((line) => line && !afterLines.has(line));
  const added = [...afterLines].filter((line) => line && !beforeLines.has(line));
  return [...removed.map((line) => `- ${line}`), ...added.map((line) => `+ ${line}`)];
}

async function compare(path) {
  const target = new URL(`${path.split("/").at(-1)}.txt`, SNAPSHOT_DIR);
  const [latest, snapshot] = await Promise.all([fetchSource(path), readSnapshot(target)]);
  if (latest === snapshot) {
    return null;
  }
  if (values.update) {
    await writeFile(target, latest);
  }
  return { path, diff: lineDiff(snapshot, latest) };
}

const changes = (await Promise.all(SOURCES.map(compare))).filter(Boolean);

if (changes.length === 0) {
  console.log(`The Next.js sources on ${values.ref} match the snapshot.`);
  process.exit(0);
}

console.log(`The Next.js sources on ${values.ref} changed since the snapshot.\n`);
for (const { path, diff } of changes) {
  console.log(`## \`${path}\`\n\n\`\`\`diff\n${diff.join("\n")}\n\`\`\`\n`);
}
console.log(
  "Review each change: update the rule messages that quote Next.js, and consider a rule for each new error.",
);
process.exit(values.update ? 0 : 1);
