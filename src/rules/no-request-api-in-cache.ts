import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule } from "@oxlint/plugins";

import type { CacheScope, FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import { getStaticPropertyName, runsUnconditionally, unwrapExpression } from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import type { CallSite } from "../utils/call-graph.ts";
import { HTTP_METHODS } from "../utils/contexts.ts";
import {
  requestApiUrl,
  ruleDocsUrl,
  scopeLabel,
  USE_CACHE_PRIVATE_URL,
} from "../utils/messages.ts";
import { requestApiNames } from "../utils/next-bindings.ts";
import {
  analyze,
  getBoolean,
  getRuleOptions,
  getStringList,
  STRING_LIST_SCHEMA,
  textMentions,
} from "../utils/options.ts";
import { findPropReads, SEARCH_PARAMS_RECEIVERS } from "../utils/props.ts";

const RULE_NAME = "no-request-api-in-cache";
const CACHE_MARKERS = ["use cache", "unstable_cache"];
const REQUEST_MARKERS = ["next/headers", "next/server", "searchParams"];
const ROUTE_FILE = /(^|[\\/])route\.[cm]?[jt]sx?$/;
const DRAFT_MODE_MUTATIONS: ReadonlySet<string> = new Set(["disable", "enable"]);
const REQUEST_PROPERTIES: ReadonlySet<string> = new Set([
  "body",
  "cookies",
  "formData",
  "headers",
  "json",
  "nextUrl",
  "signal",
  "text",
  "url",
]);

interface RequestUse {
  readonly name: string;
  readonly isConnection: boolean;
  readonly node: ESTree.CallExpression;
}

export const noRequestApiInCache: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow request-time APIs such as `cookies()`, `headers()`, `connection()`, and `searchParams` inside cache scopes.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      requestApi:
        "`{{api}}` can't be read inside {{scope}}. Read it outside the cached function and pass what you need as an argument. See {{url}}",
      searchParams:
        "`searchParams` can't be read inside {{scope}}. Await it outside the cached function and pass what you need as an argument. See {{url}}",
      connection:
        "`connection()` can't be called inside {{scope}} because cached functions may run during prerendering, without an incoming request. Call it outside the cached function. See {{url}}",
      connectionPrivate: `\`connection()\` can't be called inside "use cache: private" because private cached functions may run during prefetching, without a navigation request. Call it outside the cached function. See ${USE_CACHE_PRIVATE_URL}`,
      draftModeMutation:
        "`draftMode().{{method}}()` can't be called inside {{scope}}. Draft mode can be read inside a cached function, but enabling or disabling it must happen outside. See {{url}}",
      routeHandlerRequest:
        "`{{expression}}` can't be read inside {{scope}}. Read it outside the cached function and pass what you need as an argument. See {{url}}",
      transitive:
        "`{{helper}}()` reads `{{api}}` (line {{line}}), and it's called inside {{scope}} function `{{fn}}`. Read the value outside the cached function and pass it as an argument. See {{url}}",
    },
    schema: [
      {
        type: "object",
        properties: {
          requestApis: STRING_LIST_SCHEMA,
          checkTransitive: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ checkTransitive: true }],
  },
  createOnce(context) {
    let calls: ESTree.CallExpression[] = [];

    return {
      before() {
        calls = [];
        return mayApply(context);
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        const options = getRuleOptions(context);
        const analysis = analyze(context, options);
        const uses = new Map<FunctionInfo, RequestUse[]>();

        for (const call of calls) {
          const use = toRequestUse(analysis, call);
          if (use) {
            const scope = analysis.getCacheScope(call);
            if (scope) {
              reportDirectUse(context, use, scope);
            } else {
              recordUse(analysis, uses, use);
            }
          } else {
            checkDraftModeMutation(context, analysis, call);
          }
        }

        checkSearchParams(context, analysis);
        checkRouteHandlerRequest(context, analysis);
        if (getBoolean(options, "checkTransitive", true)) {
          checkTransitiveUses(context, analysis, uses);
        }
        calls = [];
      },
    };
  },
});

function mayApply(context: Context): boolean {
  const { text } = context.sourceCode;
  if (!textMentions(text, CACHE_MARKERS)) {
    return false;
  }
  const requestApis = getStringList(context, getRuleOptions(context), "requestApis") ?? [];
  return (
    textMentions(text, [...REQUEST_MARKERS, ...requestApiNames(requestApis)]) ||
    ROUTE_FILE.test(context.filename)
  );
}

function toRequestUse(analysis: FileAnalysis, call: ESTree.CallExpression): RequestUse | null {
  const api = analysis.bindings.resolve(call.callee);
  if (api === "cookies" || api === "headers" || api === "connection") {
    return { name: `${api}()`, isConnection: api === "connection", node: call };
  }
  const custom = api ? null : analysis.bindings.resolveRequestApi(call.callee);
  return custom ? { name: `${custom.name}()`, isConnection: false, node: call } : null;
}

function isReportable(use: RequestUse, scope: CacheScope): boolean {
  return scope.kind.type !== "private" || use.isConnection;
}

function reportDirectUse(context: Context, use: RequestUse, scope: CacheScope): void {
  if (!isReportable(use, scope)) {
    return;
  }
  const data = { scope: scopeLabel(scope.kind), url: requestApiUrl(scope.kind) };
  if (!use.isConnection) {
    context.report({ node: use.node, messageId: "requestApi", data: { ...data, api: use.name } });
  } else if (scope.kind.type === "private") {
    context.report({ node: use.node, messageId: "connectionPrivate" });
  } else {
    context.report({ node: use.node, messageId: "connection", data });
  }
}

function recordUse(
  analysis: FileAnalysis,
  uses: Map<FunctionInfo, RequestUse[]>,
  use: RequestUse,
): void {
  const unit = analysis.unitAt(use.node);
  if (!unit) {
    return;
  }
  const list = uses.get(unit);
  if (list) {
    list.push(use);
  } else {
    uses.set(unit, [use]);
  }
}

function checkDraftModeMutation(
  context: Context,
  analysis: FileAnalysis,
  call: ESTree.CallExpression,
): void {
  const callee = unwrapExpression(call.callee);
  const method = getStaticPropertyName(callee);
  if (
    callee.type !== "MemberExpression" ||
    method === null ||
    !DRAFT_MODE_MUTATIONS.has(method) ||
    !isDraftModeValue(analysis, callee.object)
  ) {
    return;
  }
  const scope = analysis.getCacheScope(call);
  if (scope && scope.kind.type !== "private") {
    context.report({
      node: call,
      messageId: "draftModeMutation",
      data: { method, scope: scopeLabel(scope.kind), url: requestApiUrl(scope.kind) },
    });
  }
}

function isDraftModeValue(analysis: FileAnalysis, expression: Node): boolean {
  const target = unwrapExpression(expression);
  if (target.type === "AwaitExpression") {
    return isDraftModeValue(analysis, target.argument);
  }
  if (target.type === "CallExpression") {
    return analysis.bindings.resolve(target.callee) === "draftMode";
  }
  if (target.type !== "Identifier") {
    return false;
  }
  const definition = analysis.findVariable(target)?.defs[0];
  const declarator = definition?.type === "Variable" ? definition.node : null;
  return (
    declarator?.type === "VariableDeclarator" &&
    declarator.init !== null &&
    declarator.init.type !== "Identifier" &&
    isDraftModeValue(analysis, declarator.init)
  );
}

function checkSearchParams(context: Context, analysis: FileAnalysis): void {
  if (analysis.file.segment !== "page") {
    return;
  }
  for (const unit of analysis.units) {
    if (!unit.exportNames.some((name) => SEARCH_PARAMS_RECEIVERS.has(name))) {
      continue;
    }
    for (const read of findPropReads(analysis, unit, "searchParams")) {
      const scope = analysis.getCacheScope(read);
      if (scope && scope.kind.type !== "private") {
        context.report({
          node: read,
          messageId: "searchParams",
          data: { scope: scopeLabel(scope.kind), url: requestApiUrl(scope.kind) },
        });
        break;
      }
    }
  }
}

function checkRouteHandlerRequest(context: Context, analysis: FileAnalysis): void {
  if (analysis.file.kind !== "route-handler") {
    return;
  }
  for (const unit of analysis.units) {
    const request = unit.node.params[0];
    if (
      !unit.exportNames.some((name) => HTTP_METHODS.has(name)) ||
      request?.type !== "Identifier"
    ) {
      continue;
    }
    for (const reference of analysis.findVariable(request)?.references ?? []) {
      const parent = reference.identifier.parent;
      const property = getStaticPropertyName(parent);
      const scope = analysis.getCacheScope(reference.identifier);
      if (
        scope &&
        scope.kind.type !== "private" &&
        parent.type === "MemberExpression" &&
        parent.object === reference.identifier &&
        property !== null &&
        REQUEST_PROPERTIES.has(property)
      ) {
        context.report({
          node: parent,
          messageId: "routeHandlerRequest",
          data: {
            expression: `${request.name}.${property}`,
            scope: scopeLabel(scope.kind),
            url: requestApiUrl(scope.kind),
          },
        });
      }
    }
  }
}

function checkTransitiveUses(
  context: Context,
  analysis: FileAnalysis,
  uses: ReadonlyMap<FunctionInfo, readonly RequestUse[]>,
): void {
  if (uses.size === 0) {
    return;
  }
  const keys = analysis.sourceCode.visitorKeys;
  const isBoundary = (info: FunctionInfo | undefined): boolean =>
    !info || info.directive?.type === "server" || analysis.getCacheScope(info.node) !== null;
  const isProvablePath = (path: readonly CallSite[]): boolean =>
    path.slice(1).every((site) => site.caller && runsUnconditionally(site.node, site.caller, keys));

  for (const unit of analysis.units) {
    const scope = analysis.getCacheScope(unit.node);
    if (!scope) {
      continue;
    }
    const reported = new Set<string>();
    const reached = analysis.callGraph.reachableFrom(unit.node, {
      stopAt: (fn) => isBoundary(analysis.functions.get(fn)),
    });
    for (const { fn, path } of reached) {
      const helper = analysis.functions.get(fn);
      const use =
        helper && !isBoundary(helper) && isProvablePath(path)
          ? uses
              .get(helper)
              ?.find(
                (item) => isReportable(item, scope) && runsUnconditionally(item.node, fn, keys),
              )
          : undefined;
      const site = path[0];
      if (!helper || !use || !site || reported.has(use.name)) {
        continue;
      }
      reported.add(use.name);
      context.report({
        node: site.node,
        messageId: "transitive",
        data: {
          helper: helper.name,
          api: use.name,
          line: context.sourceCode.getLoc(use.node).start.line,
          scope: scopeLabel(scope.kind),
          fn: analysis.functions.get(scope.owner)?.name ?? unit.name,
          url:
            use.isConnection && scope.kind.type === "private"
              ? USE_CACHE_PRIVATE_URL
              : requestApiUrl(scope.kind),
        },
      });
    }
  }
}
