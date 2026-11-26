import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule, Suggestion } from "@oxlint/plugins";

import type { ContextOrigin, FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import type { FnContext } from "../utils/contexts.ts";
import { insertStatementAtBodyStart } from "../utils/fixes.ts";
import {
  CACHE_LIFE_OUTSIDE_USE_CACHE_URL,
  CACHE_TAG_OUTSIDE_USE_CACHE_URL,
  ruleDocsUrl,
} from "../utils/messages.ts";
import { analyze, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "no-cache-api-outside-cache";

const OUTSIDE_CONTEXTS: ReadonlySet<FnContext> = new Set([
  "build-time-generator",
  "client",
  "metadata",
  "proxy",
  "route-handler",
  "server-action",
]);

const CACHEABLE_CONTEXTS: ReadonlySet<FnContext> = new Set([
  "component-render",
  "metadata",
  "unknown",
]);

export const noCacheApiOutsideCache: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow `cacheTag()` and `cacheLife()` outside a `"use cache"` or `"use cache: private"` scope.',
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    hasSuggestions: true,
    messages: {
      outside:
        '`{{api}}()` can only be called inside a "use cache" or "use cache: private" function. Add the directive to the function that should be cached, or move this call into one. See {{url}}',
      moduleScope:
        '`{{api}}()` can\'t be called at module scope. Call it inside a "use cache" function. See {{url}}',
      unstableCache:
        '`{{api}}()` doesn\'t work inside `unstable_cache()`. Use the `tags` or `revalidate` options of `unstable_cache`, or switch this function to "use cache". See {{url}}',
      addUseCache: 'Add "use cache" to `{{fn}}`',
    },
    schema: [],
  },
  createOnce(context) {
    let calls: ESTree.CallExpression[] = [];

    return {
      before() {
        calls = [];
        return textMentions(context.sourceCode.text, ["next/cache"]);
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        const analysis = analyze(context, getRuleOptions(context));
        for (const call of calls) {
          const api = analysis.bindings.resolve(call.callee);
          if (api === "cacheTag" || api === "cacheLife") {
            check(context, analysis, call, api);
          }
        }
        calls = [];
      },
    };
  },
});

function check(
  context: Context,
  analysis: FileAnalysis,
  call: ESTree.CallExpression,
  api: "cacheLife" | "cacheTag",
): void {
  const data = {
    api,
    url: api === "cacheTag" ? CACHE_TAG_OUTSIDE_USE_CACHE_URL : CACHE_LIFE_OUTSIDE_USE_CACHE_URL,
  };
  const scope = analysis.getCacheScope(call);
  if (scope) {
    if (scope.kind.type === "unstable") {
      context.report({ node: call, messageId: "unstableCache", data });
    }
    return;
  }
  if (!analysis.functionAt(call)) {
    context.report({ node: call, messageId: "moduleScope", data });
    return;
  }

  const unit = analysis.unitAt(call);
  if (hasOutsideAncestor(analysis, call)) {
    context.report({
      node: call,
      messageId: "outside",
      data,
      suggest: suggestUseCache(context, unit),
    });
    return;
  }
  if (!unit || unit.exportNames.length > 0) {
    return;
  }
  const origins = analysis.getContextOrigins(call);
  if (origins.length === 0 || !origins.every(isOutsideOrigin)) {
    return;
  }
  const inUnstableCache = origins.some((origin) => origin.scope?.kind.type === "unstable");
  context.report({
    node: call,
    messageId: inUnstableCache ? "unstableCache" : "outside",
    data,
    suggest: inUnstableCache ? null : suggestUseCache(context, unit),
  });
}

function hasOutsideAncestor(analysis: FileAnalysis, call: ESTree.CallExpression): boolean {
  for (let info = analysis.functionAt(call); info; info = info.parent) {
    if (info.isUnit && isOutsideContext(info.context, info)) {
      return true;
    }
  }
  return false;
}

function isOutsideContext(context: FnContext, fn: FunctionInfo | null): boolean {
  return OUTSIDE_CONTEXTS.has(context) || (context === "component-render" && !!fn?.isSegmentRoot);
}

function isOutsideOrigin(origin: ContextOrigin): boolean {
  return (
    isOutsideContext(origin.context, origin.fn) ||
    (origin.context === "cached" && origin.scope?.kind.type === "unstable")
  );
}

function suggestUseCache(context: Context, unit: FunctionInfo | null): Suggestion[] | null {
  if (!unit?.node.async || !CACHEABLE_CONTEXTS.has(unit.context)) {
    return null;
  }
  const fix = insertStatementAtBodyStart(context.sourceCode, unit.node, '"use cache";', null);
  return fix ? [{ messageId: "addUseCache", data: { fn: unit.name }, fix }] : null;
}
