import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule, Suggestion } from "@oxlint/plugins";

import { getStringValue, unwrapExpression } from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import { BUILTIN_PROFILES, evaluateNumber } from "../utils/cache-life.ts";
import { classifyFile } from "../utils/contexts.ts";
import type { FileInfo } from "../utils/contexts.ts";
import { getFileDirective } from "../utils/directives.ts";
import { ruleDocsUrl } from "../utils/messages.ts";
import {
  getAppDirs,
  getBoolean,
  getRuleOptions,
  STRING_LIST_SCHEMA,
  textMentionsAll,
} from "../utils/options.ts";

const RULE_NAME = "no-legacy-segment-config";
const MIGRATION_URL = "https://nextjs.org/docs/app/guides/migrating-to-cache-components";
const LEGACY_EXPORTS: readonly string[] = [
  "dynamic",
  "experimental_ppr",
  "fetchCache",
  "revalidate",
  "runtime",
];
const PROFILE_ORDER: readonly string[] = ["seconds", "minutes", "hours", "days", "weeks", "max"];

interface LegacyExport {
  readonly name: string;
  readonly node: Node;
  readonly value: Node | null;
  readonly statement: ESTree.ExportNamedDeclaration | null;
}

export const noLegacySegmentConfig: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow route segment config exports that Next.js rejects when Cache Components is enabled.",
      recommended: false,
      url: ruleDocsUrl(RULE_NAME),
    },
    hasSuggestions: true,
    messages: {
      legacyConfig: `\`export const {{name}}\` isn't supported with Cache Components: Next.js fails the build with "Route segment config \\"{{name}}\\" is not compatible with \`nextConfig.cacheComponents\`". {{hint}} See ${MIGRATION_URL}`,
      removeExport: "Remove `export const {{name}}`",
    },
    schema: [
      {
        type: "object",
        properties: {
          cacheComponents: { type: "boolean" },
          appDir: STRING_LIST_SCHEMA,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ cacheComponents: false }],
  },
  createOnce(context) {
    return {
      before() {
        const options = getRuleOptions(context);
        return (
          getBoolean(options, "cacheComponents", false) &&
          isSegmentConfigFile(
            classifyFile(context.filename, context.cwd, getAppDirs(context, options), null),
          ) &&
          textMentionsAll(context.sourceCode.text, LEGACY_EXPORTS)
        );
      },
      "Program:exit"() {
        const { ast } = context.sourceCode;
        const file = classifyFile(
          context.filename,
          context.cwd,
          getAppDirs(context, getRuleOptions(context)),
          getFileDirective(ast),
        );
        if (!isSegmentConfigFile(file)) {
          return;
        }
        for (const legacy of collectLegacyExports(ast)) {
          report(context, legacy);
        }
      },
    };
  },
});

function isSegmentConfigFile(file: FileInfo): boolean {
  return file.kind === "segment" || file.kind === "route-handler";
}

function collectLegacyExports(program: ESTree.Program): LegacyExport[] {
  const locals = new Map<string, Node | null>();
  const found: LegacyExport[] = [];
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== "Identifier") {
          continue;
        }
        locals.set(declarator.id.name, declarator.init);
        if (
          statement.type === "ExportNamedDeclaration" &&
          LEGACY_EXPORTS.includes(declarator.id.name)
        ) {
          found.push({
            name: declarator.id.name,
            node: declarator.id,
            value: declarator.init,
            statement: declaration.declarations.length === 1 ? statement : null,
          });
        }
      }
    }
  }
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.source) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      const exported =
        specifier.exported.type === "Literal" ? specifier.exported.value : specifier.exported.name;
      const local =
        specifier.local.type === "Literal" ? specifier.local.value : specifier.local.name;
      if (LEGACY_EXPORTS.includes(exported)) {
        found.push({
          name: exported,
          node: specifier,
          value: locals.get(local) ?? null,
          statement: null,
        });
      }
    }
  }
  return found;
}

function report(context: Context, legacy: LegacyExport): void {
  const { statement } = legacy;
  const suggest: Suggestion[] | null = statement
    ? [
        {
          messageId: "removeExport",
          data: { name: legacy.name },
          fix: (fixer) => {
            const text = context.sourceCode.text;
            const end =
              text[statement.range[1]] === "\n" ? statement.range[1] + 1 : statement.range[1];
            return fixer.removeRange([statement.range[0], end]);
          },
        },
      ]
    : null;
  context.report({
    node: legacy.node,
    messageId: "legacyConfig",
    data: { name: legacy.name, hint: hintFor(legacy) },
    suggest,
  });
}

function hintFor(legacy: LegacyExport): string {
  const value = legacy.value ? unwrapExpression(legacy.value) : null;
  switch (legacy.name) {
    case "dynamic":
      return dynamicHint(value ? getStringValue(value) : null);
    case "revalidate":
      return revalidateHint(value);
    case "fetchCache":
      return 'Remove it. `fetch` is not cached by default, and "use cache" caches the data you choose.';
    case "runtime":
      return "Remove it. Cache Components requires the Node.js runtime, even when the value is `nodejs`.";
    default:
      return "Remove it. Cache Components replaces this option.";
  }
}

function dynamicHint(value: string | null): string {
  switch (value) {
    case "force-static":
      return 'Remove it, and add "use cache" to the page or layout that should be cached.';
    case "error":
      return 'Remove it, and export `ensureStatic = "navigation"` (Next.js 16.4 or later) to fail the build when the route reads uncached or runtime data.';
    default:
      return "Remove it. Routes are dynamic by default with Cache Components.";
  }
}

function revalidateHint(value: Node | null): string {
  if (value?.type === "Literal" && value.value === false) {
    return 'Remove it, and add "use cache" with `cacheLife("max")`.';
  }
  const seconds = value ? evaluateNumber(value) : null;
  if (seconds === null) {
    return 'Remove it, and set the lifetime with `cacheLife()` inside "use cache".';
  }
  if (seconds <= 0) {
    return "Remove it. Routes are dynamic by default with Cache Components.";
  }
  return `Remove it, and add "use cache" with \`cacheLife("${closestProfile(seconds)}")\`.`;
}

export function closestProfile(seconds: number): string {
  let best = PROFILE_ORDER[0] ?? "default";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const name of PROFILE_ORDER) {
    const profile = BUILTIN_PROFILES[name];
    const distance = profile
      ? Math.abs(Math.log(seconds) - Math.log(profile.revalidate))
      : bestDistance;
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}
