import type { ESTree } from "@oxlint/plugins";

import { getFunctionBodyStatements } from "./ast.ts";
import type { FunctionNode, Node } from "./ast.ts";

export type CacheKind =
  | { readonly type: "public" }
  | { readonly type: "remote" }
  | { readonly type: "private" }
  | { readonly type: "custom"; readonly name: string }
  | { readonly type: "unstable" };

export type DirectiveValue =
  | { readonly type: "cache"; readonly kind: CacheKind }
  | { readonly type: "server" }
  | { readonly type: "client" };

export type Directive = DirectiveValue & { readonly node: Node };

const CACHE_PREFIX = "use cache";
const CACHE_KIND_SEPARATOR = ": ";

export function parseDirective(value: string): DirectiveValue | null {
  if (value === "use server") {
    return { type: "server" };
  }
  if (value === "use client") {
    return { type: "client" };
  }
  if (value === CACHE_PREFIX) {
    return { type: "cache", kind: { type: "public" } };
  }
  if (!value.startsWith(CACHE_PREFIX + CACHE_KIND_SEPARATOR)) {
    return null;
  }
  const name = value.slice(CACHE_PREFIX.length + CACHE_KIND_SEPARATOR.length);
  if (name.length === 0 || /\s/.test(name)) {
    return null;
  }
  return { type: "cache", kind: parseCacheKind(name) };
}

export function getFileDirective(program: ESTree.Program): Directive | null {
  return findDirective(program.body);
}

export function getFunctionDirective(fn: FunctionNode): Directive | null {
  const statements = getFunctionBodyStatements(fn);
  return statements ? findDirective(statements) : null;
}

export function isPublicCacheKind(kind: CacheKind): boolean {
  return kind.type === "public" || kind.type === "remote" || kind.type === "custom";
}

function parseCacheKind(name: string): CacheKind {
  switch (name) {
    case "default":
      return { type: "public" };
    case "remote":
      return { type: "remote" };
    case "private":
      return { type: "private" };
    default:
      return { type: "custom", name };
  }
}

function findDirective(statements: readonly Node[]): Directive | null {
  for (const statement of statements) {
    if (statement.type !== "ExpressionStatement" || typeof statement.directive !== "string") {
      return null;
    }
    const parsed = parseDirective(statement.directive);
    if (parsed) {
      return { ...parsed, node: statement };
    }
  }
  return null;
}
