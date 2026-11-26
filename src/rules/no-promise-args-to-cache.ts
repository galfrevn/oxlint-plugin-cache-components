import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule, Variable } from "@oxlint/plugins";

import type { FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import {
  getStaticPropertyName,
  isFunctionNode,
  runsUnconditionally,
  SKIP,
  unwrapExpression,
  walk,
} from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import type { CallSite } from "../utils/call-graph.ts";
import { isPublicCacheKind } from "../utils/directives.ts";
import { ruleDocsUrl, scopeLabel, USE_CACHE_URL } from "../utils/messages.ts";
import { requestApiNames } from "../utils/next-bindings.ts";
import {
  analyze,
  getBoolean,
  getRuleOptions,
  getStringList,
  STRING_LIST_SCHEMA,
  textMentions,
} from "../utils/options.ts";
import { findDestructuredBinding } from "../utils/props.ts";

const RULE_NAME = "no-promise-args-to-cache";
const REQUEST_PROMISE_APIS: ReadonlySet<string> = new Set(["cookies", "draftMode", "headers"]);
const HELPER_REQUEST_APIS: ReadonlySet<string> = new Set([
  "connection",
  "cookies",
  "draftMode",
  "headers",
]);
const REQUEST_PROMISE_MARKERS: readonly string[] = [
  "Params",
  "params",
  "next/headers",
  "next/server",
];

export const noPromiseArgsToCache: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow passing request-time promises such as `cookies()` or `headers()` to cached functions without `await`.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      promiseArg: `\`{{arg}}\` is a Promise of request-time data passed to {{scope}} \`{{fn}}\`. Await it outside and pass the resolved values, or the cache can't fill during prerender and the build times out after 50 seconds. See ${USE_CACHE_URL}`,
      capturedPromise: `\`{{arg}}\` is a Promise of request-time data that {{scope}} function \`{{fn}}\` captures from the enclosing function. Await it outside and pass the resolved value as an argument, or the cache can't fill during prerender and the build times out after 50 seconds. See ${USE_CACHE_URL}`,
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
        const requestApis = getStringList(context, getRuleOptions(context), "requestApis") ?? [];
        return textMentions(
          context.sourceCode.text,
          ["use cache"],
          [...REQUEST_PROMISE_MARKERS, ...requestApiNames(requestApis)],
        );
      },
      "Program:exit"() {
        const options = getRuleOptions(context);
        const analysis = analyze(context, options);
        const props = getBoolean(options, "checkParams", false) ? ["searchParams", "params"] : [];
        for (const unit of analysis.units) {
          if (unit.cacheScope && isPublicCacheKind(unit.cacheScope.kind)) {
            for (const site of analysis.callGraph.callersOf(unit.node)) {
              checkSite(context, analysis, unit, site, props);
            }
            checkCapturedPromises(context, analysis, unit);
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

function checkCapturedPromises(
  context: Context,
  analysis: FileAnalysis,
  cached: FunctionInfo,
): void {
  const reported = new Set<Variable>();
  for (const reference of context.sourceCode.getScope(cached.node).through) {
    const variable = reference.resolved;
    if (!variable || reported.has(variable) || !reference.isRead()) {
      continue;
    }
    const definition = variable.defs[0];
    const declarator = definition?.type === "Variable" ? definition.node : null;
    const init = declarator?.type === "VariableDeclarator" ? declarator.init : null;
    const call = init ? unwrapExpression(init) : null;
    if (call?.type === "CallExpression" && isRequestPromiseCall(analysis, call)) {
      reported.add(variable);
      context.report({
        node: reference.identifier,
        messageId: "capturedPromise",
        data: {
          arg: variable.name,
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
    return isRequestPromiseCall(analysis, target);
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
  return init.type === "CallExpression" && isRequestPromiseCall(analysis, init);
}

function isRequestPromiseCall(analysis: FileAnalysis, call: ESTree.CallExpression): boolean {
  const api = analysis.bindings.resolve(call.callee);
  if (
    (api !== null && REQUEST_PROMISE_APIS.has(api)) ||
    analysis.bindings.resolveRequestApi(call.callee)
  ) {
    return true;
  }
  const callee = unwrapExpression(call.callee);
  const helper = callee.type === "Identifier" ? analysis.resolveFunction(callee) : null;
  return !!helper?.node.async && readsRequestApi(analysis, helper);
}

function readsRequestApi(analysis: FileAnalysis, helper: FunctionInfo): boolean {
  const keys = analysis.sourceCode.visitorKeys;
  let found = false;
  walk(helper.node, keys, (node) => {
    if (found || (node !== helper.node && isFunctionNode(node))) {
      return SKIP;
    }
    if (node.type === "CallExpression" && isHelperRequestApi(analysis, node)) {
      found = runsUnconditionally(node, helper.node, keys);
    }
    return undefined;
  });
  return found;
}

function isHelperRequestApi(analysis: FileAnalysis, call: ESTree.CallExpression): boolean {
  const api = analysis.bindings.resolve(call.callee);
  return (
    (api !== null && HELPER_REQUEST_APIS.has(api)) ||
    analysis.bindings.resolveRequestApi(call.callee) !== null
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
