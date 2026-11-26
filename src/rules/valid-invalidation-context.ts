import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule, Suggestion } from "@oxlint/plugins";

import type { ContextOrigin, FileAnalysis } from "../utils/analysis.ts";
import { calleeReplacement } from "../utils/fixes.ts";
import {
  REFRESH_URL,
  REVALIDATE_IN_USE_CACHE_URL,
  REVALIDATE_TAG_URL,
  ruleDocsUrl,
  scopeLabel,
  UPDATE_TAG_URL,
} from "../utils/messages.ts";
import type { NextApi } from "../utils/next-bindings.ts";
import { analyze, getRuleOptions, STRING_LIST_SCHEMA, textMentions } from "../utils/options.ts";

const RULE_NAME = "valid-invalidation-context";

type InvalidationApi = "refresh" | "revalidatePath" | "revalidateTag" | "updateTag";

interface Violation {
  readonly priority: number;
  readonly messageId: string;
  readonly data: Record<string, string>;
  readonly suggestReplacement: boolean;
}

const INVALIDATION_APIS: ReadonlySet<NextApi> = new Set([
  "refresh",
  "revalidatePath",
  "revalidateTag",
  "updateTag",
]);

export const validInvalidationContext: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `revalidateTag()`, `revalidatePath()`, `updateTag()`, and `refresh()` to run where Next.js allows them.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    hasSuggestions: true,
    messages: {
      inCachedFunction: `\`{{api}}()\` can't be called inside a cached function ({{scope}} \`{{fn}}\`). Call it from a Server Action or Route Handler instead. See ${REVALIDATE_IN_USE_CACHE_URL}`,
      duringRender: `\`{{api}}()\` can't be called during render (\`{{fn}}\` is a Server Component). Call it from a Server Action or Route Handler instead. See ${REVALIDATE_IN_USE_CACHE_URL}`,
      inBuildTimeGenerator: `\`{{api}}()\` can't be called inside \`{{generator}}\`. Call it from a Server Action or Route Handler instead. See ${REVALIDATE_IN_USE_CACHE_URL}`,
      updateTagOutsideAction: `\`updateTag()\` can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use \`revalidateTag()\` instead. See ${UPDATE_TAG_URL}`,
      refreshOutsideAction: `\`refresh()\` can only be called from within a Server Action. In Client Components, use \`router.refresh()\`. See ${REFRESH_URL}`,
      inProxyOrClient: `\`{{api}}()\` only works in Server Actions and Route Handlers, not in {{where}}. See ${REVALIDATE_TAG_URL}`,
      useRevalidateTag: "Replace with `revalidateTag(tag, { expire: 0 })`",
    },
    schema: [
      {
        type: "object",
        properties: { appDir: STRING_LIST_SCHEMA },
        additionalProperties: false,
      },
    ],
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
          if (api && INVALIDATION_APIS.has(api)) {
            check(context, analysis, call, api as InvalidationApi);
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
  api: InvalidationApi,
): void {
  let worst: Violation | null = null;
  for (const origin of analysis.getContextOrigins(call)) {
    const candidate = toViolation(analysis, api, origin);
    if (candidate && (!worst || candidate.priority < worst.priority)) {
      worst = candidate;
    }
  }
  if (!worst) {
    return;
  }
  context.report({
    node: call,
    messageId: worst.messageId,
    data: worst.data,
    suggest: worst.suggestReplacement ? suggestRevalidateTag(analysis, call) : null,
  });
}

function toViolation(
  analysis: FileAnalysis,
  api: InvalidationApi,
  origin: ContextOrigin,
): Violation | null {
  const name = origin.fn?.name ?? "anonymous";
  switch (origin.context) {
    case "build-time-generator":
      return violation(0, "inBuildTimeGenerator", { api, generator: name });
    case "cached": {
      const owner = origin.scope ? analysis.functions.get(origin.scope.owner) : undefined;
      return violation(1, "inCachedFunction", {
        api,
        scope: origin.scope ? scopeLabel(origin.scope.kind) : '"use cache"',
        fn: owner?.name ?? name,
      });
    }
    case "component-render":
      return violation(2, "duringRender", { api, fn: name });
    case "route-handler":
    case "metadata":
      return actionOnlyViolation(api, origin.context === "route-handler");
    case "proxy":
    case "client":
      return (
        actionOnlyViolation(api, false) ??
        violation(3, "inProxyOrClient", {
          api,
          where: origin.context === "proxy" ? "Proxy" : "Client Components",
        })
      );
    case "server-action":
    case "unknown":
      return null;
  }
}

function actionOnlyViolation(api: InvalidationApi, inRouteHandler: boolean): Violation | null {
  if (api === "updateTag") {
    return { ...violation(3, "updateTagOutsideAction", {}), suggestReplacement: inRouteHandler };
  }
  return api === "refresh" ? violation(3, "refreshOutsideAction", {}) : null;
}

function violation(priority: number, messageId: string, data: Record<string, string>): Violation {
  return { priority, messageId, data, suggestReplacement: false };
}

function suggestRevalidateTag(
  analysis: FileAnalysis,
  call: ESTree.CallExpression,
): Suggestion[] | null {
  const tag = call.arguments[0];
  if (call.arguments.length !== 1 || !tag || tag.type === "SpreadElement") {
    return null;
  }
  const replacement = calleeReplacement(analysis, call, "next/cache", "revalidateTag");
  if (!replacement) {
    return null;
  }
  return [
    {
      messageId: "useRevalidateTag",
      fix: (fixer) => [
        fixer.replaceText(call.callee, replacement.text),
        fixer.insertTextAfter(tag, ", { expire: 0 }"),
        ...(replacement.imports?.apply(fixer) ?? []),
      ],
    },
  ];
}
