import { defineRule } from "@oxlint/plugins";
import type { ESTree, Rule, Suggestion } from "@oxlint/plugins";

import type { FileAnalysis } from "../utils/analysis.ts";
import { unwrapExpression } from "../utils/ast.ts";
import { calleeReplacement, quoteLike } from "../utils/fixes.ts";
import { REVALIDATE_TAG_SINGLE_ARG_URL, ruleDocsUrl } from "../utils/messages.ts";
import { analyze, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "require-revalidate-tag-profile";

export const requireRevalidateTagProfile: Rule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Require a cache profile as the second argument of `revalidateTag()`.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    hasSuggestions: true,
    messages: {
      singleArg: `\`revalidateTag()\` without a second argument is deprecated and behaves like \`{ expire: 0 }\`. Pass a profile ("max" for stale-while-revalidate) or use \`updateTag()\` in Server Actions. See ${REVALIDATE_TAG_SINGLE_ARG_URL}`,
      keepBehavior: "Pass { expire: 0 } (same behavior)",
      useUpdateTag: "Use updateTag() (Server Action)",
      useMax: 'Pass "max" (stale-while-revalidate)',
    },
    schema: [],
  },
  createOnce(context) {
    let calls: ESTree.CallExpression[] = [];

    return {
      before() {
        calls = [];
        return textMentions(context.sourceCode.text, ["next/cache"], ["revalidateTag"]);
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        const analysis = analyze(context, getRuleOptions(context));
        for (const call of calls) {
          const tag = call.arguments[0];
          if (
            call.arguments.length === 1 &&
            tag &&
            tag.type !== "SpreadElement" &&
            analysis.bindings.resolve(call.callee) === "revalidateTag"
          ) {
            context.report({
              node: call,
              messageId: "singleArg",
              suggest: buildSuggestions(analysis, call, tag),
            });
          }
        }
        calls = [];
      },
    };
  },
});

function buildSuggestions(
  analysis: FileAnalysis,
  call: ESTree.CallExpression,
  tag: ESTree.Expression,
): Suggestion[] {
  const suggestions: Suggestion[] = [
    { messageId: "keepBehavior", fix: (fixer) => fixer.insertTextAfter(tag, ", { expire: 0 }") },
  ];
  const origins = analysis.getContextOrigins(call);
  const replacement =
    origins.length > 0 && origins.every((origin) => origin.context === "server-action")
      ? calleeReplacement(analysis, call, "next/cache", "updateTag")
      : null;
  if (replacement) {
    suggestions.push({
      messageId: "useUpdateTag",
      fix: (fixer) => [
        fixer.replaceText(call.callee, replacement.text),
        ...(replacement.imports?.apply(fixer) ?? []),
      ],
    });
  }
  const max = quoteLike(unwrapExpression(tag), "max");
  suggestions.push({ messageId: "useMax", fix: (fixer) => fixer.insertTextAfter(tag, `, ${max}`) });
  return suggestions;
}
