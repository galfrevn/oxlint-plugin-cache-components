import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule } from "@oxlint/plugins";

import type { FileAnalysis } from "../utils/analysis.ts";
import { skipTransparentParents, unwrapExpression } from "../utils/ast.ts";
import { ruleDocsUrl, scopeLabel } from "../utils/messages.ts";
import { analyze, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "no-react-cache-across-boundary";
const MIGRATION_URL = "https://nextjs.org/docs/app/guides/migrating-to-cache-components";

export const noReactCacheAcrossBoundary: Rule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow sharing a `React.cache` function between cached and uncached code, where its result is not shared.",
      recommended: false,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      isolated: `\`{{name}}\` is wrapped in \`React.cache\`, but \`React.cache\` runs in an isolated scope inside {{scope}}, so the call on line {{line}} isn't shared here. To share request data across cached functions, use "use cache: private". See ${MIGRATION_URL}`,
    },
    schema: [],
  },
  createOnce(context) {
    return {
      before() {
        return textMentions(context.sourceCode.text, ["use cache"], ["react"]);
      },
      "Program:exit"() {
        const analysis = analyze(context, getRuleOptions(context));
        for (const statement of context.sourceCode.ast.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type === "VariableDeclaration") {
            for (const declarator of declaration.declarations) {
              checkDeclarator(context, analysis, declarator);
            }
          }
        }
      },
    };
  },
});

function checkDeclarator(
  context: Context,
  analysis: FileAnalysis,
  declarator: ESTree.VariableDeclarator,
): void {
  const init = declarator.init ? unwrapExpression(declarator.init) : null;
  if (
    declarator.id.type !== "Identifier" ||
    init?.type !== "CallExpression" ||
    analysis.bindings.resolve(init.callee) !== "reactCache"
  ) {
    return;
  }
  const calls = (analysis.findVariable(declarator.id)?.references ?? []).flatMap((reference) => {
    const outer = skipTransparentParents(reference.identifier);
    return outer.parent?.type === "CallExpression" && outer.parent.callee === outer
      ? [outer.parent]
      : [];
  });
  const outside = calls.find((call) => analysis.getCacheScope(call) === null);
  if (!outside) {
    return;
  }
  const line = context.sourceCode.getLoc(outside).start.line;
  for (const call of calls) {
    const scope = analysis.getCacheScope(call);
    if (scope) {
      context.report({
        node: call,
        messageId: "isolated",
        data: { name: declarator.id.name, scope: scopeLabel(scope.kind), line },
      });
    }
  }
}
