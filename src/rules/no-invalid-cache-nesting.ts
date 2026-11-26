import { defineRule } from "@oxlint/plugins";
import type { Context, Rule } from "@oxlint/plugins";

import { isCacheBoundary } from "../utils/analysis.ts";
import type { FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import type { Node } from "../utils/ast.ts";
import { isPublicCacheKind } from "../utils/directives.ts";
import type { CacheKind } from "../utils/directives.ts";
import {
  ruleDocsUrl,
  scopeLabel,
  USE_CACHE_PRIVATE_COMPOSITION_URL,
  USE_CACHE_REMOTE_URL,
} from "../utils/messages.ts";
import { analyze, getBoolean, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "no-invalid-cache-nesting";

type Nesting =
  | "privateInBuildTime"
  | "privateInPublic"
  | "privateInUnstableCache"
  | "remoteInPrivate";

export const noInvalidCacheNesting: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow cache directive combinations that Next.js rejects.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      privateInPublic: `"use cache: private" function \`{{inner}}\` can't be nested inside {{outerScope}} function \`{{outer}}\` because a shared cached function can't depend on private request data. Nest it only inside another "use cache: private". See ${USE_CACHE_PRIVATE_COMPOSITION_URL}`,
      privateInUnstableCache: `"use cache: private" function \`{{inner}}\` can't be used inside \`unstable_cache()\` because \`unstable_cache()\` uses a shared cache that can't contain private request data. Call it outside \`unstable_cache()\`. See ${USE_CACHE_PRIVATE_COMPOSITION_URL}`,
      privateInBuildTime: `"use cache: private" function \`{{inner}}\` needs an active request, so it can't be used during \`{{generator}}\`. Move it to a request-time component or function. See ${USE_CACHE_PRIVATE_COMPOSITION_URL}`,
      remoteInPrivate: `"use cache: remote" function \`{{inner}}\` can't be nested inside "use cache: private" function \`{{outer}}\`. See ${USE_CACHE_REMOTE_URL}`,
    },
    schema: [
      {
        type: "object",
        properties: { checkRemoteInPrivate: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ checkRemoteInPrivate: false }],
  },
  createOnce(context) {
    return {
      before() {
        return textMentions(context.sourceCode.text, ["use cache: private"]);
      },
      "Program:exit"() {
        const options = getRuleOptions(context);
        const analysis = analyze(context, options);
        const checkRemoteInPrivate = getBoolean(options, "checkRemoteInPrivate", false);
        for (const outer of analysis.units) {
          const nesting = outerNesting(outer);
          if (nesting) {
            checkOuter(context, analysis, outer, nesting, checkRemoteInPrivate);
          }
        }
      },
    };
  },
});

function outerNesting(outer: FunctionInfo): Nesting | "private" | null {
  const kind = outer.cacheScope?.kind;
  if (kind?.type === "unstable") {
    return "privateInUnstableCache";
  }
  if (kind?.type === "private") {
    return "private";
  }
  if (kind && isPublicCacheKind(kind)) {
    return "privateInPublic";
  }
  return outer.context === "build-time-generator" ? "privateInBuildTime" : null;
}

function checkOuter(
  context: Context,
  analysis: FileAnalysis,
  outer: FunctionInfo,
  nesting: Nesting | "private",
  checkRemoteInPrivate: boolean,
): void {
  const reported = new Set<Node>();
  const reached = analysis.callGraph.reachableFrom(outer.node, {
    stopAt: (fn) => isCacheBoundary(analysis.functions.get(fn)),
  });
  for (const { fn, path } of reached) {
    const inner = analysis.functions.get(fn);
    const site = path[0];
    const messageId = inner?.cacheScope
      ? innerViolation(nesting, inner.cacheScope.kind, checkRemoteInPrivate)
      : null;
    if (!inner || !site || !messageId || reported.has(site.node)) {
      continue;
    }
    reported.add(site.node);
    context.report({
      node: site.node,
      messageId,
      data: {
        inner: inner.name,
        outer: outer.name,
        outerScope: outer.cacheScope ? scopeLabel(outer.cacheScope.kind) : "",
        generator: outer.name,
      },
    });
  }
}

function innerViolation(
  nesting: Nesting | "private",
  inner: CacheKind,
  checkRemoteInPrivate: boolean,
): Nesting | null {
  if (nesting === "private") {
    return checkRemoteInPrivate && inner.type === "remote" ? "remoteInPrivate" : null;
  }
  return inner.type === "private" ? nesting : null;
}
