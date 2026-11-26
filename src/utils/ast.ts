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
  forEachChild(node, keys, (child) => {
    children.push(child);
  });
  return children;
}

function forEachChild(node: Node, keys: VisitorKeys, visit: (child: Node) => void): void {
  const record = node as unknown as Record<string, unknown>;
  for (const key of keys[node.type] ?? []) {
    if (TYPE_ONLY_KEYS.has(key)) {
      continue;
    }
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item);
        }
      }
    } else if (isNode(value)) {
      visit(value);
    }
  }
}

export const SKIP: unique symbol = Symbol("skip");

export function walk(
  root: Node,
  keys: VisitorKeys,
  enter: (node: Node) => typeof SKIP | void,
  leave: (node: Node) => void = () => {},
): void {
  const nodes: Node[] = [root];
  const leaving: boolean[] = [false];
  const children: Node[] = [];
  const collect = (child: Node): void => {
    children.push(child);
  };
  while (nodes.length > 0) {
    const node = nodes.pop() as Node;
    if (leaving.pop()) {
      leave(node);
      continue;
    }
    if (enter(node) === SKIP) {
      continue;
    }
    nodes.push(node);
    leaving.push(true);
    children.length = 0;
    forEachChild(node, keys, collect);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      nodes.push(children[index] as Node);
      leaving.push(false);
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
  if (target.type === "AwaitExpression") {
    return getMemberPath(target.argument);
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

const EXIT_STATEMENTS: ReadonlySet<string> = new Set([
  "BreakStatement",
  "ContinueStatement",
  "ReturnStatement",
  "ThrowStatement",
]);

export function runsUnconditionally(node: Node, fn: FunctionNode, keys: VisitorKeys): boolean {
  let child = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (parent === fn) {
      return child === fn.body;
    }
    if (!isUnconditionalChild(parent, child)) {
      return false;
    }
    if (STATEMENT_LIST_OWNERS.has(parent.type) && hasExitBefore(parent, child, keys)) {
      return false;
    }
  }
  return false;
}

function isUnconditionalChild(parent: Node, child: Node): boolean {
  switch (parent.type) {
    case "IfStatement":
    case "ConditionalExpression":
      return child === parent.test;
    case "LogicalExpression":
      return child === parent.left;
    case "SwitchStatement":
      return child === parent.discriminant;
    case "ForStatement":
      return child === parent.init;
    case "ForInStatement":
    case "ForOfStatement":
      return child === parent.right;
    case "TryStatement":
      return child === parent.block || child === parent.finalizer;
    case "CallExpression":
      return !parent.optional || child === parent.callee;
    case "MemberExpression":
      return !parent.optional || child === parent.object;
    case "AssignmentPattern":
    case "CatchClause":
    case "DoWhileStatement":
    case "SwitchCase":
    case "WhileStatement":
      return false;
    default:
      return !isFunctionNode(parent);
  }
}

function hasExitBefore(owner: Node, child: Node, keys: VisitorKeys): boolean {
  const statements = (owner as { body?: unknown }).body;
  if (!Array.isArray(statements)) {
    return false;
  }
  for (const statement of statements as Node[]) {
    if (statement === child) {
      return false;
    }
    if (containsExit(statement, keys)) {
      return true;
    }
  }
  return false;
}

function containsExit(root: Node, keys: VisitorKeys): boolean {
  let found = false;
  walk(root, keys, (node) => {
    if (found || isFunctionNode(node)) {
      return SKIP;
    }
    found = EXIT_STATEMENTS.has(node.type);
    return undefined;
  });
  return found;
}
