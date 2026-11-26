import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule, Suggestion } from "@oxlint/plugins";

import { isCacheBoundary } from "../utils/analysis.ts";
import type { FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import { classifyCacheLife, parseCacheLifeCall } from "../utils/cache-life.ts";
import { isPublicCacheKind } from "../utils/directives.ts";
import { insertStatementAtBodyStart, quoteLike } from "../utils/fixes.ts";
import { NESTED_CACHE_LIFE_URL, ruleDocsUrl } from "../utils/messages.ts";
import {
  analyze,
  getBoolean,
  getRuleOptions,
  getStringList,
  STRING_LIST_SCHEMA,
  textMentions,
} from "../utils/options.ts";

const RULE_NAME = "require-cachelife-when-nested";
const DEFAULT_SHORT_PROFILES: readonly string[] = ["seconds"];

interface ShortLife {
  readonly messageId: "shortExpire" | "zeroRevalidate";
  readonly call: ESTree.CallExpression;
}

export const requireCacheLifeWhenNested: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `cacheLife()` in a cached function that calls a short-lived cached function from the same file.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    hasSuggestions: true,
    messages: {
      zeroRevalidate: `"use cache" function \`{{outer}}\` has no \`cacheLife()\`, but it calls \`{{inner}}\`, which uses \`revalidate: 0\`. Add \`cacheLife()\` to \`{{outer}}\` to choose whether to prerender it with a non-zero \`revalidate\` or keep it dynamic. See ${NESTED_CACHE_LIFE_URL}`,
      shortExpire: `"use cache" function \`{{outer}}\` has no \`cacheLife()\`, but it calls \`{{inner}}\`, whose \`expire\` is under 5 minutes ({{profile}}). Add \`cacheLife()\` to \`{{outer}}\` to choose whether to prerender it with a longer \`expire\` or keep it dynamic. See ${NESTED_CACHE_LIFE_URL}`,
      addCacheLifeShort: "Add `{{call}}` to `{{outer}}` to keep it dynamic",
      addCacheLifeMinutes: "Add `{{call}}` to `{{outer}}` to prerender it",
    },
    schema: [
      {
        type: "object",
        properties: {
          shortProfiles: STRING_LIST_SCHEMA,
          followHelpers: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ followHelpers: true }],
  },
  createOnce(context) {
    let calls: ESTree.CallExpression[] = [];

    return {
      before() {
        calls = [];
        return textMentions(context.sourceCode.text, ["cacheLife"], ["use cache"]);
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        const options = getRuleOptions(context);
        const analysis = analyze(context, options);
        check(context, analysis, {
          calls: calls.filter((call) => analysis.bindings.resolve(call.callee) === "cacheLife"),
          shortProfiles: getStringList(context, options, "shortProfiles") ?? DEFAULT_SHORT_PROFILES,
          followHelpers: getBoolean(options, "followHelpers", true),
        });
        calls = [];
      },
    };
  },
});

function check(
  context: Context,
  analysis: FileAnalysis,
  input: {
    readonly calls: readonly ESTree.CallExpression[];
    readonly shortProfiles: readonly string[];
    readonly followHelpers: boolean;
  },
): void {
  if (input.calls.length === 0) {
    return;
  }
  const ownCalls = new Map<FunctionInfo, ESTree.CallExpression[]>();
  for (const call of input.calls) {
    const scope = analysis.getCacheScope(call);
    const owner = scope ? analysis.functions.get(scope.owner) : analysis.unitAt(call);
    if (owner) {
      ownCalls.set(owner, [...(ownCalls.get(owner) ?? []), call]);
    }
  }

  const lifeCallsOf = (unit: FunctionInfo): ESTree.CallExpression[] => {
    const helpers = analysis.callGraph
      .reachableFrom(unit.node, { stopAt: (fn) => isCacheBoundary(analysis.functions.get(fn)) })
      .map(({ fn }) => analysis.functions.get(fn))
      .filter((info): info is FunctionInfo => !isCacheBoundary(info));
    return [unit, ...helpers].flatMap((info) => ownCalls.get(info) ?? []);
  };

  const shortLife = new Map<FunctionInfo, ShortLife | null>();
  const shortLifeOf = (unit: FunctionInfo): ShortLife | null => {
    if (!shortLife.has(unit)) {
      shortLife.set(unit, findShortLife(lifeCallsOf(unit), input.shortProfiles));
    }
    return shortLife.get(unit) ?? null;
  };

  for (const outer of analysis.units) {
    if (!outer.cacheScope || !isPublicCacheKind(outer.cacheScope.kind)) {
      continue;
    }
    if (lifeCallsOf(outer).length > 0) {
      continue;
    }
    const reached = analysis.callGraph.reachableFrom(outer.node, {
      maxDepth: input.followHelpers ? undefined : 1,
      stopAt: (fn) => isCacheBoundary(analysis.functions.get(fn)),
    });
    for (const { fn } of reached) {
      const inner = analysis.functions.get(fn);
      const short =
        inner?.cacheScope && isPublicCacheKind(inner.cacheScope.kind) ? shortLifeOf(inner) : null;
      if (inner && short) {
        report(context, outer, inner, short);
        break;
      }
    }
  }
}

function findShortLife(
  calls: readonly ESTree.CallExpression[],
  shortProfiles: readonly string[],
): ShortLife | null {
  for (const call of calls.toSorted((a, b) => a.range[0] - b.range[0])) {
    const life = classifyCacheLife(parseCacheLifeCall(call), shortProfiles);
    if (life === "zero-revalidate") {
      return { messageId: "zeroRevalidate", call };
    }
    if (life === "short-expire") {
      return { messageId: "shortExpire", call };
    }
  }
  return null;
}

function report(
  context: Context,
  outer: FunctionInfo,
  inner: FunctionInfo,
  short: ShortLife,
): void {
  const { sourceCode } = context;
  const shortCall = sourceCode.getText(short.call);
  const callee = sourceCode.getText(short.call.callee);
  const minutesCall = `${callee}(${quoteLike(short.call.arguments[0], "minutes")})`;
  const anchor = outer.directive?.node ?? null;

  const suggestions: Suggestion[] = [];
  for (const [messageId, call] of [
    ["addCacheLifeShort", shortCall],
    ["addCacheLifeMinutes", minutesCall],
  ] as const) {
    const fix = insertStatementAtBodyStart(sourceCode, outer.node, `${call};`, anchor);
    if (fix) {
      suggestions.push({ messageId, data: { call, outer: outer.name }, fix });
    }
  }

  const name = outer.node.type === "ArrowFunctionExpression" ? null : outer.node.id;
  context.report({
    node: anchor ?? name ?? outer.node,
    messageId: short.messageId,
    data: { outer: outer.name, inner: inner.name, profile: `\`${shortCall}\`` },
    suggest: suggestions,
  });
}
