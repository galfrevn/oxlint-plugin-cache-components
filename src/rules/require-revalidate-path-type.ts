import { defineRule } from "@oxlint/plugins";
import type { ESTree, Rule, SourceCode } from "@oxlint/plugins";

import { unwrapExpression } from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import { quoteLike } from "../utils/fixes.ts";
import { REVALIDATE_PATH_URL, ruleDocsUrl } from "../utils/messages.ts";
import { analyze, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "require-revalidate-path-type";
const DYNAMIC_SEGMENT = /\/\[[^/]+\](?=\/|$)/;
const EXPRESSION_PLACEHOLDER = "\u0000";

export const requireRevalidatePathType: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require the `type` argument when `revalidatePath()` receives a dynamic route, which otherwise does nothing.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    hasSuggestions: true,
    messages: {
      missingType: `\`revalidatePath("{{path}}")\` has no effect: "{{path}}" is a dynamic route, so it needs a \`type\` ("page" or "layout"). See ${REVALIDATE_PATH_URL}`,
      addPageType: 'Add "page" as the type',
      addLayoutType: 'Add "layout" as the type',
    },
    schema: [],
  },
  createOnce(context) {
    let calls: ESTree.CallExpression[] = [];

    return {
      before() {
        calls = [];
        return textMentions(context.sourceCode.text, ["revalidatePath"]);
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        const analysis = analyze(context, getRuleOptions(context));
        for (const call of calls) {
          const argument = call.arguments[0];
          if (
            call.arguments.length !== 1 ||
            !argument ||
            argument.type === "SpreadElement" ||
            analysis.bindings.resolve(call.callee) !== "revalidatePath"
          ) {
            continue;
          }
          const path = getDynamicPath(context.sourceCode, argument);
          if (path === null) {
            continue;
          }
          const reference = unwrapExpression(argument);
          context.report({
            node: call,
            messageId: "missingType",
            data: { path },
            suggest: (["page", "layout"] as const).map((type) => ({
              messageId: type === "page" ? "addPageType" : "addLayoutType",
              fix: (fixer) => fixer.insertTextAfter(argument, `, ${quoteLike(reference, type)}`),
            })),
          });
        }
        calls = [];
      },
    };
  },
});

function getDynamicPath(sourceCode: SourceCode, argument: Node): string | null {
  const target = unwrapExpression(argument);
  if (target.type === "Literal" && typeof target.value === "string") {
    return DYNAMIC_SEGMENT.test(target.value) ? target.value : null;
  }
  if (target.type !== "TemplateLiteral") {
    return null;
  }
  const staticPath = target.quasis
    .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
    .join(EXPRESSION_PLACEHOLDER);
  return DYNAMIC_SEGMENT.test(staticPath) ? sourceCode.getText(target).slice(1, -1) : null;
}
