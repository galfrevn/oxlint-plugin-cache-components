import type { ESTree, Fix, Fixer, SourceCode } from "@oxlint/plugins";

import type { FileAnalysis } from "./analysis.ts";
import { unwrapExpression } from "./ast.ts";
import type { FunctionNode, Node } from "./ast.ts";
import type { NextModule } from "./next-bindings.ts";

export interface ImportPlan {
  readonly local: string;
  apply(fixer: Fixer): Fix[];
}

export function quoteLike(reference: Node | undefined, value: string): string {
  const raw = reference && reference.type === "Literal" ? reference.raw : null;
  const quote = raw?.startsWith("'") ? "'" : '"';
  return `${quote}${value}${quote}`;
}

export function planNamedImport(
  analysis: FileAnalysis,
  module: NextModule,
  exported: string,
): ImportPlan | null {
  const existing = analysis.bindings.findNamedImport(module, exported);
  if (existing) {
    return { local: existing.local, apply: () => [] };
  }
  if (isNameTaken(analysis.sourceCode, exported)) {
    return null;
  }
  const lastSpecifier = analysis.bindings.findImportDeclaration(module)?.specifiers.at(-1);
  if (!lastSpecifier) {
    return null;
  }
  return {
    local: exported,
    apply: (fixer) => [fixer.insertTextAfter(lastSpecifier, `, ${exported}`)],
  };
}

export function calleeReplacement(
  analysis: FileAnalysis,
  call: ESTree.CallExpression,
  module: NextModule,
  exported: string,
): { readonly text: string; readonly imports: ImportPlan | null } | null {
  const callee = unwrapExpression(call.callee);
  if (callee.type === "MemberExpression" && !callee.computed) {
    return { text: `${analysis.sourceCode.getText(callee.object)}.${exported}`, imports: null };
  }
  const plan = planNamedImport(analysis, module, exported);
  return plan ? { text: plan.local, imports: plan } : null;
}

export function insertStatementAtBodyStart(
  sourceCode: SourceCode,
  fn: FunctionNode,
  statement: string,
  after: Node | null,
): ((fixer: Fixer) => Fix) | null {
  const body = fn.body;
  if (body?.type !== "BlockStatement") {
    return null;
  }
  const anchor = after ?? body.body[0] ?? null;
  if (!anchor) {
    const indent = indentationOf(sourceCode, fn);
    return (fixer) => fixer.replaceText(body, `{\n${indent}  ${statement}\n${indent}}`);
  }
  const sameLine = sourceCode.getLoc(anchor).start.line === sourceCode.getLoc(body).start.line;
  const separator = sameLine ? " " : `\n${indentationOf(sourceCode, anchor)}`;
  return after
    ? (fixer) => fixer.insertTextAfter(after, `${separator}${statement}`)
    : (fixer) => fixer.insertTextBefore(anchor, `${statement}${separator}`);
}

function indentationOf(sourceCode: SourceCode, node: Node): string {
  const line = sourceCode.lines[sourceCode.getLoc(node).start.line - 1] ?? "";
  return /^\s*/.exec(line)?.[0] ?? "";
}

function isNameTaken(sourceCode: SourceCode, name: string): boolean {
  return sourceCode.scopeManager.scopes.some(
    (scope) => (scope.type === "module" || scope.type === "global") && scope.set.has(name),
  );
}
