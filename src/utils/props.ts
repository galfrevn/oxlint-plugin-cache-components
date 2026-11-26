import type { FileAnalysis, FunctionInfo } from "./analysis.ts";
import { getStaticPropertyName } from "./ast.ts";
import type { Node } from "./ast.ts";

export function findPropRead(
  analysis: FileAnalysis,
  unit: FunctionInfo,
  prop: string,
): Node | null {
  const param = unit.node.params[0];
  if (!param) {
    return null;
  }
  if (param.type === "Identifier") {
    const variable = analysis.findVariable(param);
    for (const reference of variable?.references ?? []) {
      const parent = reference.identifier.parent;
      if (
        parent.type === "MemberExpression" &&
        parent.object === reference.identifier &&
        getStaticPropertyName(parent) === prop
      ) {
        return parent;
      }
    }
    return null;
  }
  const binding = findDestructuredBinding(param, prop);
  const variable = binding ? analysis.findVariable(binding) : null;
  return variable?.references.find((reference) => reference.isRead())?.identifier ?? null;
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
