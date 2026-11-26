import type { ESTree } from "@oxlint/plugins";

export type Node = ESTree.Node;
export type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;
export type VisitorKeys = Readonly<Record<string, readonly string[]>>;

const TRANSPARENT_WRAPPERS: ReadonlySet<string> = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSInstantiationExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const TYPE_ONLY_KEYS: ReadonlySet<string> = new Set([
  "returnType",
  "superTypeArguments",
  "typeAnnotation",
  "typeArguments",
  "typeParameters",
]);

const STATEMENT_LIST_OWNERS: ReadonlySet<string> = new Set([
  "BlockStatement",
  "Program",
  "StaticBlock",
  "SwitchCase",
]);

export function isFunctionNode(node: Node | null | undefined): node is FunctionNode {
  return (
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression"
  );
}

export function unwrapExpression(node: Node): Node {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type)) {
    current = (current as { expression: Node }).expression;
  }
  return current;
}

export function skipTransparentParents(node: Node): Node {
  let current = node;
  while (current.parent && TRANSPARENT_WRAPPERS.has(current.parent.type)) {
    current = current.parent;
  }
  return current;
}

export function isAwaited(node: Node): boolean {
  return skipTransparentParents(node).parent?.type === "AwaitExpression";
}

export function childNodes(node: Node, keys: VisitorKeys): Node[] {
  const children: Node[] = [];
  for (const key of keys[node.type] ?? []) {
    if (TYPE_ONLY_KEYS.has(key)) {
      continue;
    }
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    } else if (isNode(value)) {
      children.push(value);
    }
  }
  return children;
}

export function walk(
  root: Node,
  keys: VisitorKeys,
  enter: (node: Node) => void,
  leave: (node: Node) => void,
): void {
  const stack: { node: Node; leaving: boolean }[] = [{ node: root, leaving: false }];
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    if (entry.leaving) {
      leave(entry.node);
      continue;
    }
    enter(entry.node);
    stack.push({ node: entry.node, leaving: true });
    const children = childNodes(entry.node, keys);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) {
        stack.push({ node: child, leaving: false });
      }
    }
  }
}

export function findEnclosingFunction(node: Node): FunctionNode | null {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionNode(current)) {
      return current;
    }
  }
  return null;
}

export function getStaticPropertyName(node: Node): string | null {
  if (node.type !== "MemberExpression") {
    return null;
  }
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (node.computed) {
    return getStringValue(node.property);
  }
  return null;
}

export function getStringValue(node: Node): string | null {
  const target = unwrapExpression(node);
  if (target.type === "Literal" && typeof target.value === "string") {
    return target.value;
  }
  if (target.type === "TemplateLiteral" && target.expressions.length === 0) {
    return target.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

export function getMemberPath(node: Node): string[] | null {
  const target = unwrapExpression(node);
  if (target.type === "Identifier") {
    return [target.name];
  }
  if (target.type === "ThisExpression") {
    return ["this"];
  }
  if (target.type === "CallExpression") {
    return getMemberPath(target.callee);
  }
  if (target.type === "MemberExpression") {
    const property = getStaticPropertyName(target);
    const object = getMemberPath(target.object);
    return property !== null && object !== null ? [...object, property] : null;
  }
  return null;
}

export function getFunctionBodyStatements(fn: FunctionNode): Node[] | null {
  return fn.body?.type === "BlockStatement" ? fn.body.body : null;
}

export function getNearestStatement(node: Node, boundary: Node): Node | null {
  for (let current: Node | null = node; current && current !== boundary; current = current.parent) {
    if (current.parent && STATEMENT_LIST_OWNERS.has(current.parent.type)) {
      return current;
    }
  }
  return null;
}

export function contains(outer: Node, inner: Node): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

export function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
