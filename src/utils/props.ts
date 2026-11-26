import type { FileAnalysis, FunctionInfo } from "./analysis.ts";
import { getStaticPropertyName } from "./ast.ts";
import type { Node } from "./ast.ts";

export const SEARCH_PARAMS_RECEIVERS: ReadonlySet<string> = new Set([
  "default",
  "generateMetadata",
  "generateViewport",
]);

export function findPropReads(analysis: FileAnalysis, unit: FunctionInfo, prop: string): Node[] {
  const param = unit.node.params[0];
  if (!param) {
    return [];
  }
  if (param.type === "Identifier") {
    const references = analysis.findVariable(param)?.references ?? [];
    return references.flatMap((reference) => {
      const parent = reference.identifier.parent;
      return parent.type === "MemberExpression" &&
        parent.object === reference.identifier &&
        getStaticPropertyName(parent) === prop
        ? [parent]
        : [];
    });
  }
  const binding = findDestructuredBinding(param, prop);
  const references = binding ? (analysis.findVariable(binding)?.references ?? []) : [];
  return references
    .filter((reference) => reference.isRead())
    .map((reference) => reference.identifier);
}

export function findDestructuredBinding(
  param: Node,
  prop: string,
): (Node & { name: string }) | null {
  const pattern = param.type === "AssignmentPattern" ? param.left : param;
  if (pattern.type !== "ObjectPattern") {
    return null;
  }
  for (const property of pattern.properties) {
    if (property.type !== "Property" || property.computed) {
      continue;
    }
    const key = property.key.type === "Identifier" ? property.key.name : null;
    const value =
      property.value.type === "AssignmentPattern" ? property.value.left : property.value;
    if (key === prop && value.type === "Identifier") {
      return value;
    }
  }
  return null;
}
