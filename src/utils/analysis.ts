import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import {
  isAwaited,
  isFunctionNode,
  isPascalCase,
  skipTransparentParents,
  unwrapExpression,
  walk,
} from "./ast.ts";
import type { FunctionNode, Node } from "./ast.ts";
import { createCallGraph } from "./call-graph.ts";
import type { CallGraph, CallSite } from "./call-graph.ts";
import {
  BUILD_TIME_GENERATORS,
  classifyFile,
  HTTP_METHODS,
  METADATA_GENERATORS,
  RENDER_SEGMENTS,
} from "./contexts.ts";
import type { FileInfo, FnContext } from "./contexts.ts";
import { getFileDirective, getFunctionDirective } from "./directives.ts";
import type { CacheKind, Directive } from "./directives.ts";
import { createNextBindings, parseRequestApis } from "./next-bindings.ts";
import type { NextBindings } from "./next-bindings.ts";

export interface CacheScope {
  readonly kind: CacheKind;
  readonly owner: FunctionNode;
  readonly via: "function" | "file" | "unstable_cache";
  readonly directive: Node | null;
}

export interface FunctionInfo {
  readonly node: FunctionNode;
  readonly parent: FunctionInfo | null;
  readonly name: string;
  readonly directive: Directive | null;
  readonly exportNames: readonly string[];
  readonly wrappers: readonly ESTree.CallExpression[];
  readonly isUnit: boolean;
  readonly isLocalHelper: boolean;
  readonly isSegmentRoot: boolean;
  readonly isUnstableCacheCallback: boolean;
  readonly cacheScope: CacheScope | null;
  readonly context: FnContext;
}

export interface ContextOrigin {
  readonly context: FnContext;
  readonly fn: FunctionInfo | null;
  readonly scope: CacheScope | null;
}

export interface AnalysisOptions {
  readonly appDirs: readonly string[];
  readonly requestApis: readonly string[];
}

export interface AnalysisInput {
  readonly sourceCode: SourceCode;
  readonly filename: string;
  readonly cwd: string;
}

export interface FileAnalysis {
  readonly sourceCode: SourceCode;
  readonly fileDirective: Directive | null;
  readonly file: FileInfo;
  readonly bindings: NextBindings;
  readonly functions: ReadonlyMap<FunctionNode, FunctionInfo>;
  readonly units: readonly FunctionInfo[];
  readonly callGraph: CallGraph;
  functionAt(node: Node): FunctionInfo | null;
  unitAt(node: Node): FunctionInfo | null;
  getCacheScope(node: Node): CacheScope | null;
  getContextOrigins(node: Node): readonly ContextOrigin[];
  getEffectiveContexts(node: Node): ReadonlySet<FnContext>;
  findVariable(identifier: Node & { name: string }): Variable | null;
  resolveFunction(expression: Node): FunctionInfo | null;
}

interface Draft {
  readonly node: FunctionNode;
  readonly parent: Draft | null;
  returnsJsx: boolean;
  readonly exportNames: string[];
  readonly wrappers: ESTree.CallExpression[];
}

interface CacheEntry {
  readonly text: string;
  readonly filename: string;
  readonly analysis: FileAnalysis;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const cache = new WeakMap<ESTree.Program, Map<string, CacheEntry>>();
const UNKNOWN_ORIGIN: ContextOrigin = { context: "unknown", fn: null, scope: null };
const OPAQUE_CALLBACK_APIS: ReadonlySet<string> = new Set([
  "after",
  "reactCache",
  "unstable_cache",
]);
const MAX_ALIAS_DEPTH = 4;

export function isCacheBoundary(info: FunctionInfo | undefined): boolean {
  return !info || info.cacheScope !== null || info.directive?.type === "server";
}

export function getFileAnalysis(input: AnalysisInput, options: AnalysisOptions): FileAnalysis {
  const program = input.sourceCode.ast;
  const key = JSON.stringify([options.appDirs, options.requestApis]);
  let entries = cache.get(program);
  if (!entries) {
    entries = new Map();
    cache.set(program, entries);
  }
  const cached = entries.get(key);
  if (cached && cached.text === input.sourceCode.text && cached.filename === input.filename) {
    return cached.analysis;
  }
  const analysis = analyzeFile(input, options);
  entries.set(key, { text: input.sourceCode.text, filename: input.filename, analysis });
  return analysis;
}

function analyzeFile(input: AnalysisInput, options: AnalysisOptions): FileAnalysis {
  const { sourceCode } = input;
  const program = sourceCode.ast;
  const fileDirective = getFileDirective(program);
  const file = classifyFile(input.filename, input.cwd, options.appDirs, fileDirective);
  const bindings = createNextBindings(sourceCode, parseRequestApis(options.requestApis));

  const drafts = new Map<FunctionNode, Draft>();
  const calls: { node: ESTree.CallExpression; fn: FunctionNode | null }[] = [];
  const elements: { node: ESTree.JSXOpeningElement; fn: FunctionNode | null }[] = [];
  const stack: Draft[] = [];

  walk(
    program,
    sourceCode.visitorKeys,
    (node) => {
      const current = stack.at(-1) ?? null;
      if (isFunctionNode(node)) {
        const draft: Draft = {
          node,
          parent: current,
          returnsJsx:
            node.body?.type !== "BlockStatement" && node.body !== null && isJsx(node.body),
          exportNames: [],
          wrappers: [],
        };
        drafts.set(node, draft);
        stack.push(draft);
      } else if (node.type === "ReturnStatement" && current && node.argument) {
        current.returnsJsx ||= isJsx(node.argument);
      } else if (node.type === "CallExpression") {
        calls.push({ node, fn: current?.node ?? null });
      } else if (node.type === "JSXOpeningElement") {
        elements.push({ node, fn: current?.node ?? null });
      }
    },
    (node) => {
      if (isFunctionNode(node)) {
        stack.pop();
      }
    },
  );

  const findVariable = (identifier: Node & { name: string }): Variable | null => {
    const scope = sourceCode.getScope(identifier);
    const reference = scope.references.find((ref) => ref.identifier === identifier);
    if (reference) {
      return reference.resolved;
    }
    for (let current: typeof scope | null = scope; current; current = current.upper) {
      const variable = current.set.get(identifier.name);
      if (variable) {
        return variable;
      }
    }
    return null;
  };

  const functionOfVariable = (variable: Variable | null, depth: number): FunctionNode | null => {
    const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
    if (!variable || !definition || depth > MAX_ALIAS_DEPTH) {
      return null;
    }
    if (definition.type === "FunctionName") {
      return isFunctionNode(definition.node) ? definition.node : null;
    }
    const declarator = definition.node;
    if (
      definition.type !== "Variable" ||
      declarator.type !== "VariableDeclarator" ||
      declarator.id.type !== "Identifier" ||
      !declarator.init ||
      variable.references.some((reference) => reference.isWrite() && !reference.init)
    ) {
      return null;
    }
    const init = unwrapExpression(declarator.init);
    if (init.type === "CallExpression") {
      const api = bindings.resolve(init.callee);
      const callback = init.arguments[0];
      return (api === "reactCache" || api === "unstable_cache") && callback
        ? functionOfExpression(callback, depth + 1)
        : null;
    }
    return functionOfExpression(init, depth + 1);
  };

  const functionOfExpression = (expression: Node, depth: number): FunctionNode | null => {
    const target = unwrapExpression(expression);
    if (isFunctionNode(target)) {
      return target;
    }
    return target.type === "Identifier" ? functionOfVariable(findVariable(target), depth) : null;
  };

  const addExport = (
    expression: Node,
    name: string,
    wrappers: readonly ESTree.CallExpression[],
  ): void => {
    const target = unwrapExpression(expression);
    if (target.type === "CallExpression") {
      for (const argument of target.arguments) {
        addExport(argument, name, [...wrappers, target]);
      }
      return;
    }
    const fn = functionOfExpression(target, 0);
    const draft = fn ? drafts.get(fn) : undefined;
    if (draft) {
      draft.exportNames.push(name);
      draft.wrappers.push(...wrappers);
    }
  };

  collectExports(program, addExport);

  const unstableCallbacks = new Set<FunctionNode>();
  for (const { node } of calls) {
    const callback = node.arguments[0];
    if (callback && bindings.resolve(node.callee) === "unstable_cache") {
      const fn = functionOfExpression(callback, 0);
      if (fn) {
        unstableCallbacks.add(fn);
      }
    }
  }

  const functions = new Map<FunctionNode, FunctionInfo>();
  const units: FunctionInfo[] = [];
  for (const draft of drafts.values()) {
    const directive = getFunctionDirective(draft.node);
    const info: Mutable<FunctionInfo> = {
      node: draft.node,
      parent: draft.parent ? (functions.get(draft.parent.node) ?? null) : null,
      name: getFunctionName(draft.node, draft.exportNames),
      directive,
      exportNames: draft.exportNames,
      wrappers: draft.wrappers,
      isUnit: !isTransparentCallback(draft.node, directive, draft.exportNames, bindings),
      isLocalHelper: isLocalHelper(draft.node),
      isSegmentRoot:
        file.kind === "segment" &&
        file.segment !== null &&
        RENDER_SEGMENTS.has(file.segment) &&
        draft.exportNames.includes("default"),
      isUnstableCacheCallback: unstableCallbacks.has(draft.node),
      cacheScope: getOwnCacheScope(draft.node, directive, draft.exportNames),
      context: "unknown",
    };
    functions.set(draft.node, info);
    if (info.isUnit) {
      units.push(info);
    }
  }

  function getOwnCacheScope(
    node: FunctionNode,
    directive: Directive | null,
    exportNames: readonly string[],
  ): CacheScope | null {
    if (directive?.type === "cache") {
      return { kind: directive.kind, owner: node, via: "function", directive: directive.node };
    }
    if (unstableCallbacks.has(node)) {
      return { kind: { type: "unstable" }, owner: node, via: "unstable_cache", directive: null };
    }
    if (fileDirective?.type === "cache" && exportNames.length > 0) {
      return { kind: fileDirective.kind, owner: node, via: "file", directive: fileDirective.node };
    }
    return null;
  }

  const functionAt = (node: Node): FunctionInfo | null => {
    for (let current: Node | null = node; current; current = current.parent) {
      if (isFunctionNode(current)) {
        return functions.get(current) ?? null;
      }
    }
    return null;
  };

  const unitAt = (node: Node): FunctionInfo | null => {
    let info = functionAt(node);
    while (info && !info.isUnit) {
      info = info.parent;
    }
    return info;
  };

  const getCacheScope = (node: Node): CacheScope | null => {
    for (let info = functionAt(node); info; info = info.parent) {
      if (info.directive?.type === "server") {
        return null;
      }
      if (info.cacheScope) {
        return info.cacheScope;
      }
    }
    return null;
  };

  for (const info of functions.values()) {
    const draft = drafts.get(info.node);
    if (info.isUnit && draft) {
      (info as Mutable<FunctionInfo>).context = getOwnContext(
        info,
        draft.returnsJsx,
        file,
        getCacheScope(info.node) !== null,
      );
    }
  }

  const sites: CallSite[] = [];
  for (const { node, fn } of calls) {
    const callee = unwrapExpression(node.callee);
    const target =
      callee.type === "Identifier" ? functionOfVariable(findVariable(callee), 0) : null;
    if (target) {
      sites.push({ caller: callerOf(fn), callee: target, node, awaited: isAwaited(node) });
    }
  }
  for (const { node, fn } of elements) {
    if (node.name.type === "JSXIdentifier" && isPascalCase(node.name.name)) {
      const target = functionOfVariable(findVariable(node.name), 0);
      if (target) {
        sites.push({ caller: callerOf(fn), callee: target, node, awaited: false });
      }
    }
  }

  function callerOf(fn: FunctionNode | null): FunctionNode | null {
    return fn ? (unitAt(fn)?.node ?? null) : null;
  }

  const callGraph = createCallGraph(sites);
  const originCache = new Map<FunctionInfo, readonly ContextOrigin[]>();

  const originsOf = (unit: FunctionInfo, visiting: Set<FunctionInfo>): ContextOrigin[] => {
    if (unit.context !== "unknown") {
      return [{ context: unit.context, fn: unit, scope: getCacheScope(unit.node) }];
    }
    if (visiting.has(unit)) {
      return [];
    }
    visiting.add(unit);
    const origins: ContextOrigin[] = [];
    const callers = callGraph.callersOf(unit.node);
    for (const site of callers) {
      const caller = site.caller ? functions.get(site.caller) : undefined;
      origins.push(...(caller ? originsOf(caller, visiting) : [UNKNOWN_ORIGIN]));
    }
    if (unit.exportNames.length > 0) {
      origins.push(UNKNOWN_ORIGIN);
    }
    if (callers.length === 0) {
      const parentUnit = unit.isLocalHelper && unit.parent ? unitAt(unit.parent.node) : null;
      origins.push(...(parentUnit ? originsOf(parentUnit, visiting) : [UNKNOWN_ORIGIN]));
    }
    return origins.length > 0 ? origins : [UNKNOWN_ORIGIN];
  };

  const getContextOrigins = (node: Node): readonly ContextOrigin[] => {
    const unit = unitAt(node);
    if (!unit) {
      return [];
    }
    const cached = originCache.get(unit);
    if (cached) {
      return cached;
    }
    const origins = dedupeOrigins(originsOf(unit, new Set()));
    originCache.set(unit, origins);
    return origins;
  };

  return {
    sourceCode,
    fileDirective,
    file,
    bindings,
    functions,
    units,
    callGraph,
    functionAt,
    unitAt,
    getCacheScope,
    getContextOrigins,
    getEffectiveContexts: (node) =>
      new Set(getContextOrigins(node).map((origin) => origin.context)),
    findVariable,
    resolveFunction: (expression) => {
      const fn = functionOfExpression(expression, 0);
      return fn ? (functions.get(fn) ?? null) : null;
    },
  };
}

function collectExports(
  program: ESTree.Program,
  addExport: (expression: Node, name: string, wrappers: readonly ESTree.CallExpression[]) => void,
): void {
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      addExport(statement.declaration, "default", []);
    } else if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type") {
      const { declaration } = statement;
      if (declaration?.type === "FunctionDeclaration" && declaration.id) {
        addExport(declaration, declaration.id.name, []);
      } else if (declaration?.type === "VariableDeclaration") {
        for (const declarator of declaration.declarations) {
          if (declarator.id.type === "Identifier" && declarator.init) {
            addExport(declarator.init, declarator.id.name, []);
          }
        }
      } else if (!statement.source) {
        for (const specifier of statement.specifiers) {
          if (specifier.exportKind !== "type" && specifier.local.type === "Identifier") {
            addExport(specifier.local, getModuleExportName(specifier.exported), []);
          }
        }
      }
    }
  }
}

function getOwnContext(
  info: FunctionInfo,
  returnsJsx: boolean,
  file: FileInfo,
  isCached: boolean,
): FnContext {
  if (info.directive?.type === "server") {
    return "server-action";
  }
  if (isCached) {
    return "cached";
  }
  if (file.kind === "client") {
    return "client";
  }
  if (file.kind === "proxy") {
    return "proxy";
  }
  const names = info.exportNames;
  if (names.length > 0) {
    if (file.kind === "server-actions") {
      return "server-action";
    }
    if (file.kind === "route-handler" && names.some((name) => HTTP_METHODS.has(name))) {
      return "route-handler";
    }
    if (names.some((name) => BUILD_TIME_GENERATORS.has(name))) {
      return "build-time-generator";
    }
    if (names.some((name) => METADATA_GENERATORS.has(name))) {
      return "metadata";
    }
    if (info.isSegmentRoot) {
      return "component-render";
    }
  }
  if (file.kind !== "server-actions" && returnsJsx && isPascalCase(info.name)) {
    return "component-render";
  }
  return "unknown";
}

function isTransparentCallback(
  fn: FunctionNode,
  directive: Directive | null,
  exportNames: readonly string[],
  bindings: NextBindings,
): boolean {
  if (fn.type === "FunctionDeclaration" || directive || exportNames.length > 0) {
    return false;
  }
  const outer = skipTransparentParents(fn);
  const parent = outer.parent;
  if (parent?.type === "NewExpression") {
    return parent.arguments.includes(outer as ESTree.Argument);
  }
  if (parent?.type !== "CallExpression" || !parent.arguments.includes(outer as ESTree.Argument)) {
    return false;
  }
  const api = bindings.resolve(parent.callee);
  return api === null || !OPAQUE_CALLBACK_APIS.has(api);
}

function isLocalHelper(fn: FunctionNode): boolean {
  if (fn.type === "FunctionDeclaration") {
    return true;
  }
  const outer = skipTransparentParents(fn);
  return outer.parent?.type === "VariableDeclarator" && outer.parent.init === outer;
}

function getFunctionName(fn: FunctionNode, exportNames: readonly string[]): string {
  if (fn.type !== "ArrowFunctionExpression" && fn.id) {
    return fn.id.name;
  }
  let current: Node = skipTransparentParents(fn);
  while (current.parent?.type === "CallExpression") {
    current = skipTransparentParents(current.parent);
  }
  const parent = current.parent;
  if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }
  if (
    (parent?.type === "Property" ||
      parent?.type === "MethodDefinition" ||
      parent?.type === "PropertyDefinition") &&
    !parent.computed &&
    parent.key.type === "Identifier"
  ) {
    return parent.key.name;
  }
  if (parent?.type === "AssignmentExpression" && parent.left.type === "Identifier") {
    return parent.left.name;
  }
  return exportNames[0] ?? "anonymous";
}

function getModuleExportName(name: ESTree.ModuleExportName): string {
  return name.type === "Literal" ? name.value : name.name;
}

function isJsx(node: Node): boolean {
  const target = unwrapExpression(node);
  switch (target.type) {
    case "JSXElement":
    case "JSXFragment":
      return true;
    case "ConditionalExpression":
      return isJsx(target.consequent) || isJsx(target.alternate);
    case "LogicalExpression":
      return isJsx(target.left) || isJsx(target.right);
    case "SequenceExpression": {
      const last = target.expressions.at(-1);
      return last ? isJsx(last) : false;
    }
    default:
      return false;
  }
}

function dedupeOrigins(origins: readonly ContextOrigin[]): ContextOrigin[] {
  const seen = new Set<string>();
  const unique: ContextOrigin[] = [];
  for (const origin of origins) {
    const key = `${origin.context}:${origin.fn?.node.range[0] ?? -1}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(origin);
    }
  }
  return unique;
}
