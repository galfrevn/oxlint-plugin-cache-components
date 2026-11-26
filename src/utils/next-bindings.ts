import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { getStaticPropertyName, skipTransparentParents, unwrapExpression } from "./ast.ts";
import type { Node } from "./ast.ts";

export type NextApi =
  | "after"
  | "cacheLife"
  | "cacheTag"
  | "connection"
  | "cookies"
  | "draftMode"
  | "headers"
  | "reactCache"
  | "refresh"
  | "revalidatePath"
  | "revalidateTag"
  | "unstable_cache"
  | "updateTag";

export type NextModule = "next/cache" | "next/headers" | "next/server" | "react";

export interface RequestApiMatcher {
  readonly module: string | null;
  readonly name: string;
}

export interface ResolvedRequestApi {
  readonly name: string;
}

export interface NamedImport {
  readonly declaration: ESTree.ImportDeclaration;
  readonly local: string;
}

export interface NextBindings {
  resolve(callee: Node): NextApi | null;
  resolveRequestApi(callee: Node): ResolvedRequestApi | null;
  findNamedImport(module: NextModule, exported: string): NamedImport | null;
  findImportDeclaration(module: NextModule): ESTree.ImportDeclaration | null;
}

const MAX_ALIAS_DEPTH = 4;

const MODULE_EXPORTS: Readonly<Record<NextModule, Readonly<Record<string, NextApi>>>> = {
  "next/cache": {
    cacheLife: "cacheLife",
    cacheTag: "cacheTag",
    refresh: "refresh",
    revalidatePath: "revalidatePath",
    revalidateTag: "revalidateTag",
    unstable_cache: "unstable_cache",
    unstable_cacheLife: "cacheLife",
    unstable_cacheTag: "cacheTag",
    updateTag: "updateTag",
  },
  "next/headers": {
    cookies: "cookies",
    draftMode: "draftMode",
    headers: "headers",
  },
  "next/server": {
    after: "after",
    connection: "connection",
  },
  react: {
    cache: "reactCache",
  },
};

export function parseRequestApis(entries: readonly string[]): RequestApiMatcher[] {
  return entries.map((entry) => {
    const separator = entry.lastIndexOf(":");
    return separator > 0
      ? { module: entry.slice(0, separator), name: entry.slice(separator + 1) }
      : { module: null, name: entry };
  });
}

export function requestApiNames(entries: readonly string[]): string[] {
  return parseRequestApis(entries).map((matcher) => matcher.name);
}

export function createNextBindings(
  sourceCode: SourceCode,
  requestApis: readonly RequestApiMatcher[],
): NextBindings {
  const direct = new Map<Node, NextApi>();
  const members = new Map<Node, NextApi>();
  const requestApiReferences = new Map<Node, ResolvedRequestApi>();
  const namedImports = new Map<string, NamedImport>();
  const importDeclarations: ESTree.ImportDeclaration[] = [];

  for (const statement of sourceCode.ast.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") {
      continue;
    }
    importDeclarations.push(statement);
    const source = statement.source.value;
    const exports = isNextModule(source) ? MODULE_EXPORTS[source] : null;

    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier" && specifier.importKind === "type") {
        continue;
      }
      const variable = sourceCode.getDeclaredVariables(specifier)[0];
      if (!variable) {
        continue;
      }
      if (specifier.type === "ImportSpecifier") {
        const imported = getImportedName(specifier);
        const api = exports?.[imported];
        if (api) {
          trackReferences(sourceCode, variable, direct, api);
          namedImports.set(`${source}#${imported}`, {
            declaration: statement,
            local: specifier.local.name,
          });
        }
        if (requestApis.some((matcher) => matchesRequestApi(matcher, source, imported))) {
          trackReferences(sourceCode, variable, requestApiReferences, { name: imported });
        }
      } else if (exports) {
        trackNamespaceReferences(sourceCode, variable, members, direct, exports);
      }
    }
  }

  return {
    resolve(callee) {
      const target = unwrapExpression(callee);
      return direct.get(target) ?? members.get(target) ?? null;
    },
    resolveRequestApi(callee) {
      return requestApiReferences.get(unwrapExpression(callee)) ?? null;
    },
    findNamedImport(module, exported) {
      return namedImports.get(`${module}#${exported}`) ?? null;
    },
    findImportDeclaration(module) {
      return (
        importDeclarations.find(
          (declaration) =>
            declaration.source.value === module &&
            declaration.specifiers.some((specifier) => specifier.type === "ImportSpecifier"),
        ) ?? null
      );
    },
  };
}

function isNextModule(source: string): source is NextModule {
  return Object.hasOwn(MODULE_EXPORTS, source);
}

function getImportedName(specifier: ESTree.ImportSpecifier): string {
  return specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name;
}

function matchesRequestApi(matcher: RequestApiMatcher, source: string, imported: string): boolean {
  return matcher.name === imported && (matcher.module === null || matcher.module === source);
}

function trackReferences<T>(
  sourceCode: SourceCode,
  variable: Variable,
  target: Map<Node, T>,
  value: T,
  depth = 0,
): void {
  for (const reference of variable.references) {
    if (reference.init) {
      continue;
    }
    target.set(reference.identifier, value);
    trackAlias(sourceCode, reference.identifier, target, value, depth);
  }
}

function trackNamespaceReferences(
  sourceCode: SourceCode,
  variable: Variable,
  target: Map<Node, NextApi>,
  aliases: Map<Node, NextApi>,
  exports: Readonly<Record<string, NextApi>>,
): void {
  for (const reference of variable.references) {
    const parent = reference.identifier.parent;
    if (parent.type !== "MemberExpression" || parent.object !== reference.identifier) {
      continue;
    }
    const property = getStaticPropertyName(parent);
    const api = property === null ? undefined : exports[property];
    if (api) {
      target.set(parent, api);
      trackAlias(sourceCode, parent, aliases, api, 0);
    }
  }
}

function trackAlias<T>(
  sourceCode: SourceCode,
  node: Node,
  target: Map<Node, T>,
  value: T,
  depth: number,
): void {
  const alias = depth < MAX_ALIAS_DEPTH ? findConstAlias(sourceCode, node) : null;
  if (alias) {
    trackReferences(sourceCode, alias, target, value, depth + 1);
  }
}

function findConstAlias(sourceCode: SourceCode, node: Node): Variable | null {
  const outer = skipTransparentParents(node);
  const declarator = outer.parent;
  if (
    declarator?.type !== "VariableDeclarator" ||
    declarator.init !== outer ||
    declarator.id.type !== "Identifier" ||
    declarator.parent.type !== "VariableDeclaration" ||
    declarator.parent.kind !== "const"
  ) {
    return null;
  }
  return sourceCode.getDeclaredVariables(declarator)[0] ?? null;
}
