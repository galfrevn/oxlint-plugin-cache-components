import { defineRule } from "@oxlint/plugins";
import type { Context, Rule } from "@oxlint/plugins";

import type { FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import { getStaticPropertyName, isFunctionNode, unwrapExpression } from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import type { CallSite } from "../utils/call-graph.ts";
import { HTTP_METHODS } from "../utils/contexts.ts";
import { ruleDocsUrl, scopeLabel, USE_CACHE_URL } from "../utils/messages.ts";
import { analyze, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "serializable-cache-args";

const GLOBAL_REASONS: Readonly<Record<string, string>> = {
  Headers: "Headers object",
  Request: "Request object",
  Response: "Response object",
  URL: "URL instance",
  WeakMap: "WeakMap",
  WeakSet: "WeakSet",
};

export const serializableCacheArgs: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow arguments to cached functions that cannot be serialized.",
      recommended: false,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      nonSerializable: `\`{{expr}}\` can't be serialized as an argument to {{scope}} \`{{fn}}\` ({{reason}}). Pass plain data instead, such as strings, numbers or plain objects. See ${USE_CACHE_URL}`,
    },
    schema: [],
  },
  createOnce(context) {
    return {
      before() {
        return textMentions(context.sourceCode.text, ["use cache"]);
      },
      "Program:exit"() {
        const analysis = analyze(context, getRuleOptions(context));
        for (const unit of analysis.units) {
          if (unit.cacheScope && unit.cacheScope.kind.type !== "unstable") {
            for (const site of analysis.callGraph.callersOf(unit.node)) {
              checkSite(context, analysis, unit, site);
            }
          }
        }
      },
    };
  },
});

function checkSite(
  context: Context,
  analysis: FileAnalysis,
  cached: FunctionInfo,
  site: CallSite,
): void {
  for (const argument of argumentsOf(site)) {
    const reason = nonSerializableReason(analysis, argument);
    if (reason) {
      context.report({
        node: argument,
        messageId: "nonSerializable",
        data: {
          expr: context.sourceCode.getText(argument),
          scope: cached.cacheScope ? scopeLabel(cached.cacheScope.kind) : '"use cache"',
          fn: cached.name,
          reason,
        },
      });
    }
  }
}

function argumentsOf(site: CallSite): Node[] {
  if (site.node.type === "CallExpression") {
    return site.node.arguments.filter((argument) => argument.type !== "SpreadElement");
  }
  return site.node.attributes.flatMap((attribute) =>
    attribute.type === "JSXAttribute" &&
    attribute.value?.type === "JSXExpressionContainer" &&
    attribute.value.expression.type !== "JSXEmptyExpression"
      ? [attribute.value.expression]
      : [],
  );
}

function nonSerializableReason(analysis: FileAnalysis, argument: Node): string | null {
  const target = unwrapExpression(argument);
  switch (target.type) {
    case "ThisExpression":
      return "`this`";
    case "NewExpression":
      return target.callee.type === "Identifier"
        ? constructedReason(analysis, target.callee)
        : null;
    case "CallExpression":
      return isSymbolCall(analysis, target.callee) ? "Symbol" : null;
    case "Identifier":
      return isRouteHandlerRequest(analysis, target) ? "Request object" : null;
    case "MemberExpression": {
      const object = unwrapExpression(target.object);
      return getStaticPropertyName(target) === "headers" &&
        object.type === "Identifier" &&
        isRouteHandlerRequest(analysis, object)
        ? "Headers object"
        : null;
    }
    default:
      return null;
  }
}

function constructedReason(analysis: FileAnalysis, callee: Node & { name: string }): string | null {
  const definition = analysis.findVariable(callee)?.defs[0];
  if (!definition) {
    return GLOBAL_REASONS[callee.name] ?? null;
  }
  return definition.type === "ClassName" || definition.type === "ImportBinding"
    ? "class instance"
    : null;
}

function isSymbolCall(analysis: FileAnalysis, callee: Node): boolean {
  const target = unwrapExpression(callee);
  const root =
    target.type === "MemberExpression" && getStaticPropertyName(target) === "for"
      ? unwrapExpression(target.object)
      : target;
  return (
    root.type === "Identifier" && root.name === "Symbol" && !analysis.findVariable(root)?.defs[0]
  );
}

function isRouteHandlerRequest(
  analysis: FileAnalysis,
  identifier: Node & { name: string },
): boolean {
  if (analysis.file.kind !== "route-handler") {
    return false;
  }
  const definition = analysis.findVariable(identifier)?.defs[0];
  if (definition?.type !== "Parameter") {
    return false;
  }
  const handler = isFunctionNode(definition.node) ? analysis.functions.get(definition.node) : null;
  return (
    !!handler &&
    handler.node.params[0] === definition.name &&
    handler.exportNames.some((name) => HTTP_METHODS.has(name))
  );
}
