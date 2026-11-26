import { defineRule } from "@oxlint/plugins";
import type { Context, Rule } from "@oxlint/plugins";

import type { FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import { getStaticPropertyName, isFunctionNode, unwrapExpression } from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import type { CallSite } from "../utils/call-graph.ts";
import { isPublicCacheKind } from "../utils/directives.ts";
import { ruleDocsUrl, scopeLabel, USE_CACHE_URL } from "../utils/messages.ts";
import {
  analyze,
  getBoolean,
  getRuleOptions,
  STRING_LIST_SCHEMA,
  textMentions,
} from "../utils/options.ts";
import { findDestructuredBinding } from "../utils/props.ts";

const RULE_NAME = "no-promise-args-to-cache";
const REQUEST_PROMISE_APIS: ReadonlySet<string> = new Set(["cookies", "draftMode", "headers"]);

export const noPromiseArgsToCache: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow passing request-time promises such as `searchParams` or `cookies()` to cached functions without `await`.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      promiseArg: `\`{{arg}}\` is a Promise of request-time data passed to {{scope}} \`{{fn}}\`. Await it outside and pass the resolved values, or the cache can't fill during prerender and the build times out after 50 seconds. See ${USE_CACHE_URL}`,
    },
    schema: [
      {
        type: "object",
        properties: {
          checkParams: { type: "boolean" },
          requestApis: STRING_LIST_SCHEMA,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ checkParams: false }],
  },
  createOnce(context) {
    return {
      before() {
        return textMentions(context.sourceCode.text, ["use cache"]);
      },
      "Program:exit"() {
        const options = getRuleOptions(context);
        const analysis = analyze(context, options);
        const props = getBoolean(options, "checkParams", false)
          ? ["searchParams", "params"]
          : ["searchParams"];
        for (const unit of analysis.units) {
          if (unit.cacheScope && isPublicCacheKind(unit.cacheScope.kind)) {
            for (const site of analysis.callGraph.callersOf(unit.node)) {
              checkSite(context, analysis, unit, site, props);
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
  props: readonly string[],
): void {
  for (const argument of argumentsOf(site)) {
    if (isRequestPromise(analysis, argument, props)) {
      context.report({
        node: argument,
        messageId: "promiseArg",
        data: {
          arg: context.sourceCode.getText(argument),
          scope: cached.cacheScope ? scopeLabel(cached.cacheScope.kind) : '"use cache"',
          fn: cached.name,
        },
      });
    }
  }
}

function argumentsOf(site: CallSite): Node[] {
  if (site.node.type === "CallExpression") {
    return site.node.arguments.filter((argument) => argument.type !== "SpreadElement");
  }
  const values: Node[] = [];
  for (const attribute of site.node.attributes) {
    if (
      attribute.type === "JSXAttribute" &&
      attribute.value?.type === "JSXExpressionContainer" &&
      attribute.value.expression.type !== "JSXEmptyExpression"
    ) {
      values.push(attribute.value.expression);
    }
  }
  return values;
}

function isRequestPromise(
  analysis: FileAnalysis,
  argument: Node,
  props: readonly string[],
): boolean {
  const target = unwrapExpression(argument);
  if (target.type === "CallExpression") {
    return isRequestPromiseCall(analysis, target.callee);
  }
  if (target.type === "MemberExpression") {
    const property = getStaticPropertyName(target);
    const object = unwrapExpression(target.object);
    return (
      property !== null &&
      props.includes(property) &&
      object.type === "Identifier" &&
      isSegmentRootProps(analysis, object)
    );
  }
  if (target.type !== "Identifier") {
    return false;
  }
  const definition = analysis.findVariable(target)?.defs[0];
  if (definition?.type === "Parameter") {
    const param = segmentRootOf(analysis, definition.node)?.node.params[0];
    return (
      !!param && props.some((prop) => findDestructuredBinding(param, prop) === definition.name)
    );
  }
  const declarator = definition?.type === "Variable" ? definition.node : null;
  if (declarator?.type !== "VariableDeclarator" || !declarator.init) {
    return false;
  }
  const init = unwrapExpression(declarator.init);
  return init.type === "CallExpression" && isRequestPromiseCall(analysis, init.callee);
}

function isRequestPromiseCall(analysis: FileAnalysis, callee: Node): boolean {
  const api = analysis.bindings.resolve(callee);
  return (
    (api !== null && REQUEST_PROMISE_APIS.has(api)) ||
    analysis.bindings.resolveRequestApi(callee) !== null
  );
}

function isSegmentRootProps(analysis: FileAnalysis, identifier: Node & { name: string }): boolean {
  const definition = analysis.findVariable(identifier)?.defs[0];
  return (
    definition?.type === "Parameter" &&
    segmentRootOf(analysis, definition.node)?.node.params[0] === definition.name
  );
}

function segmentRootOf(analysis: FileAnalysis, node: Node): FunctionInfo | null {
  const fn = isFunctionNode(node) ? analysis.functions.get(node) : undefined;
  return fn?.isSegmentRoot ? fn : null;
}
