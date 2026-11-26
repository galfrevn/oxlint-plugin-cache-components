import { defineRule } from "@oxlint/plugins";
import type { ESTree, Rule } from "@oxlint/plugins";

import type { FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import {
  contains,
  getMemberPath,
  getNearestStatement,
  getStaticPropertyName,
  getStringValue,
  isAwaited,
  isFunctionNode,
  SKIP,
  unwrapExpression,
  walk,
} from "../utils/ast.ts";
import type { Node, VisitorKeys } from "../utils/ast.ts";
import { DATA_SECURITY_URL, ruleDocsUrl } from "../utils/messages.ts";
import type { NextApi } from "../utils/next-bindings.ts";
import {
  analyze,
  getBoolean,
  getOwnStringList,
  getRuleOptions,
  getStringList,
  STRING_LIST_SCHEMA,
  textMentions,
} from "../utils/options.ts";

const RULE_NAME = "require-auth-before-revalidate";

export const DEFAULT_AUTH_FUNCTIONS: readonly string[] = [
  "auth",
  "checkAuth",
  "getAuth",
  "getCurrentUser",
  "getServerSession",
  "getSession",
  "getUser",
  "currentUser",
  "requireAuth",
  "requireSession",
  "requireUser",
  "validateRequest",
  "verifySession",
];

export const DEFAULT_AUTH_WRAPPERS: readonly string[] = [
  "authActionClient.action",
  "authenticatedAction",
  "protectedAction",
  "withAuth",
];

const INVALIDATION_APIS: ReadonlySet<NextApi> = new Set([
  "revalidatePath",
  "revalidateTag",
  "updateTag",
]);
const EQUALITY_OPERATORS: ReadonlySet<string> = new Set(["!=", "!==", "==", "==="]);
const AUTH_NAME = /auth(?!or(?!iz|is))|session|permission|signature|webhook|verif|guard|protect/i;
const AUTH_MODULE = /auth(?!or)|session|^@clerk\//i;
const RATE_LIMIT_SEGMENT = /rate.?limit|limiter/i;
const RATE_LIMIT_CALL = /[a-z]Limit$/;
const AUTH_WRAPPER_SEGMENT = /auth(?!or)|admin|permission|protected|private|session|secure/i;
const FRAMEWORK_MODULES: ReadonlySet<string> = new Set([
  "next/cache",
  "next/navigation",
  "next/server",
  "react",
]);
const SECRET_ENV_NAME = /secret|token|key/i;
const SECRET_IDENTIFIER = /secret/i;
const SECRET_HEADER = /^(authorization|x-[\w-]*(secret|token|key|signature|hmac)[\w-]*)$/i;
const SECRET_COMPARISON_CALL = /equal|compare|verify|valid|check/i;

interface AuthOptions {
  readonly authFunctions: readonly string[][];
  readonly authWrappers: readonly string[][];
  readonly allowPublic: readonly string[];
  readonly trustAwaitedCalls: boolean;
}

interface CheckContext {
  readonly analysis: FileAnalysis;
  readonly options: AuthOptions;
  readonly keys: VisitorKeys;
  readonly checkSecrets: boolean;
}

export const requireAuthBeforeRevalidate: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an auth check before cache invalidation in Server Actions and Route Handlers.",
      recommended: true,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      missingAuth: `This {{context}} calls \`{{api}}()\` without an auth check. {{contextNoun}} are reachable by direct requests, so anyone could invalidate this cache. Verify the user (or a secret) before invalidating, or list your auth helper in \`authFunctions\`. See ${DATA_SECURITY_URL}`,
    },
    schema: [
      {
        type: "object",
        properties: {
          authFunctions: STRING_LIST_SCHEMA,
          authWrappers: STRING_LIST_SCHEMA,
          allowPublic: STRING_LIST_SCHEMA,
          trustAwaitedCalls: { type: "boolean" },
          appDir: STRING_LIST_SCHEMA,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowPublic: [], trustAwaitedCalls: true }],
  },
  createOnce(context) {
    let calls: ESTree.CallExpression[] = [];

    return {
      before() {
        calls = [];
        return textMentions(context.sourceCode.text, ["next/cache"]);
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        const options = getRuleOptions(context);
        const analysis = analyze(context, options);
        const authOptions: AuthOptions = {
          authFunctions: withDefaults(
            DEFAULT_AUTH_FUNCTIONS,
            getStringList(context, options, "authFunctions"),
          ),
          authWrappers: withDefaults(
            DEFAULT_AUTH_WRAPPERS,
            getStringList(context, options, "authWrappers"),
          ),
          allowPublic: getOwnStringList(options, "allowPublic") ?? [],
          trustAwaitedCalls: getBoolean(options, "trustAwaitedCalls", true),
        };
        const reported = new Set<FunctionInfo>();
        for (const call of calls) {
          const api = analysis.bindings.resolve(call.callee);
          const unit = api && INVALIDATION_APIS.has(api) ? analysis.unitAt(call) : null;
          if (unit && !reported.has(unit) && isUnprotected(analysis, unit, call, authOptions)) {
            reported.add(unit);
            const isAction = unit.context === "server-action";
            context.report({
              node: call,
              messageId: "missingAuth",
              data: {
                api: api ?? "",
                context: isAction ? "Server Action" : "Route Handler",
                contextNoun: isAction ? "Server Actions" : "Route Handlers",
              },
            });
          }
        }
        calls = [];
      },
    };
  },
});

function withDefaults(
  defaults: readonly string[],
  extra: readonly string[] | undefined,
): string[][] {
  return [...new Set([...defaults, ...(extra ?? [])])].map((entry) => entry.split("."));
}

function isUnprotected(
  analysis: FileAnalysis,
  unit: FunctionInfo,
  call: ESTree.CallExpression,
  options: AuthOptions,
): boolean {
  if (unit.context !== "server-action" && unit.context !== "route-handler") {
    return false;
  }
  if ([unit.name, ...unit.exportNames].some((name) => options.allowPublic.includes(name))) {
    return false;
  }
  if (unit.wrappers.some((wrapper) => matchesWrapper(wrapper, options.authWrappers))) {
    return false;
  }
  const check: CheckContext = {
    analysis,
    options,
    keys: analysis.sourceCode.visitorKeys,
    checkSecrets: unit.context === "route-handler",
  };
  let protectedCall = false;
  walk(unit.node, check.keys, (node) => {
    if (protectedCall || (node !== unit.node && isNestedUnit(analysis, node))) {
      return SKIP;
    }
    if (node.range[1] > call.range[0]) {
      return undefined;
    }
    if (isAuthCheck(node, check)) {
      protectedCall = dominates(node, call, unit.node);
    } else if (options.trustAwaitedCalls && node.type === "CallExpression") {
      protectedCall = isAwaitedProjectCall(analysis, node);
    }
    return undefined;
  });
  return !protectedCall;
}

function isNestedUnit(analysis: FileAnalysis, node: Node): boolean {
  return isFunctionNode(node) && analysis.functions.get(node)?.isUnit === true;
}

function isAuthCheck(node: Node, check: CheckContext): boolean {
  if (node.type === "CallExpression") {
    const path = getMemberPath(node.callee);
    if (path && (isAuthCall(path, check.options) || isRateLimitCall(path))) {
      return true;
    }
    if (isImportedFromAuthModule(check.analysis, node.callee)) {
      return true;
    }
    return (
      check.checkSecrets &&
      (isSecretHeaderRead(node) || isSecretComparisonCall(node, path, check.keys))
    );
  }
  return (
    check.checkSecrets &&
    node.type === "BinaryExpression" &&
    EQUALITY_OPERATORS.has(node.operator) &&
    containsSecret(node, check.keys)
  );
}

function isAuthCall(path: readonly string[], options: AuthOptions): boolean {
  const name = path.at(-1) ?? "";
  return AUTH_NAME.test(name) || options.authFunctions.some((entry) => endsWith(path, entry));
}

function isRateLimitCall(path: readonly string[]): boolean {
  return (
    path.some((segment) => RATE_LIMIT_SEGMENT.test(segment)) ||
    RATE_LIMIT_CALL.test(path.at(-1) ?? "")
  );
}

function isImportedFromAuthModule(analysis: FileAnalysis, callee: Node): boolean {
  const root = rootIdentifier(callee);
  const definition = root ? analysis.findVariable(root)?.defs[0] : undefined;
  const declaration = definition?.type === "ImportBinding" ? definition.parent : null;
  return declaration?.type === "ImportDeclaration" && AUTH_MODULE.test(declaration.source.value);
}

function rootIdentifier(node: Node): (Node & { name: string }) | null {
  const target = unwrapExpression(node);
  switch (target.type) {
    case "Identifier":
      return target;
    case "MemberExpression":
      return rootIdentifier(target.object);
    case "CallExpression":
      return rootIdentifier(target.callee);
    case "AwaitExpression":
      return rootIdentifier(target.argument);
    default:
      return null;
  }
}

function isSecretHeaderRead(call: ESTree.CallExpression): boolean {
  const header = call.arguments[0];
  return (
    getStaticPropertyName(unwrapExpression(call.callee)) === "get" &&
    header !== undefined &&
    header.type !== "SpreadElement" &&
    SECRET_HEADER.test(getStringValue(header) ?? "")
  );
}

function isSecretComparisonCall(
  call: ESTree.CallExpression,
  path: string[] | null,
  keys: VisitorKeys,
): boolean {
  const name = path?.at(-1);
  return name !== undefined && SECRET_COMPARISON_CALL.test(name) && containsSecret(call, keys);
}

function containsSecret(root: Node, keys: VisitorKeys): boolean {
  let found = false;
  walk(root, keys, (node) => {
    if (found || isFunctionNode(node)) {
      return SKIP;
    }
    found =
      (node.type === "MemberExpression" && isSecretEnvRead(node)) ||
      (node.type === "Identifier" && SECRET_IDENTIFIER.test(node.name));
    return undefined;
  });
  return found;
}

function isSecretEnvRead(node: ESTree.MemberExpression): boolean {
  const name = getStaticPropertyName(node);
  return (
    name !== null &&
    SECRET_ENV_NAME.test(name) &&
    getMemberPath(node.object)?.join(".") === "process.env"
  );
}

function dominates(check: Node, call: Node, boundary: Node): boolean {
  const statement = getNearestStatement(check, boundary);
  const list = statement?.parent;
  if (!statement || !list || !contains(list, call)) {
    return false;
  }
  let callAncestor: Node | null = call;
  while (callAncestor && callAncestor.parent !== list) {
    callAncestor = callAncestor.parent;
  }
  return (
    callAncestor !== null &&
    (callAncestor === statement || statement.range[1] <= callAncestor.range[0])
  );
}

function isAwaitedProjectCall(analysis: FileAnalysis, call: ESTree.CallExpression): boolean {
  const callee = unwrapExpression(call.callee);
  if (!isAwaited(call) || callee.type !== "Identifier") {
    return false;
  }
  const definition = analysis.findVariable(callee)?.defs[0];
  if (definition?.type === "ImportBinding") {
    const declaration = definition.parent;
    return (
      declaration?.type === "ImportDeclaration" && !FRAMEWORK_MODULES.has(declaration.source.value)
    );
  }
  return analysis.resolveFunction(callee) !== null;
}

function matchesWrapper(wrapper: ESTree.CallExpression, entries: readonly string[][]): boolean {
  const path = getMemberPath(wrapper.callee);
  if (!path) {
    return false;
  }
  if (path.some((segment) => AUTH_WRAPPER_SEGMENT.test(segment))) {
    return true;
  }
  return entries.some((entry) =>
    entry.length === 1
      ? path.includes(entry[0] ?? "")
      : path[0] === entry[0] && path.at(-1) === entry.at(-1),
  );
}

function endsWith(path: readonly string[], suffix: readonly string[]): boolean {
  return (
    suffix.length <= path.length &&
    suffix.every((segment, index) => path[path.length - suffix.length + index] === segment)
  );
}
