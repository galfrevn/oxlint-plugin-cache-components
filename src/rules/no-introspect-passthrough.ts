import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Rule } from "@oxlint/plugins";

import type { CacheScope, FileAnalysis, FunctionInfo } from "../utils/analysis.ts";
import {
  getMemberPath,
  getStaticPropertyName,
  isPascalCase,
  skipTransparentParents,
} from "../utils/ast.ts";
import type { Node } from "../utils/ast.ts";
import { ruleDocsUrl, scopeLabel, USE_CACHE_URL } from "../utils/messages.ts";
import { analyze, getRuleOptions, textMentions } from "../utils/options.ts";

const RULE_NAME = "no-introspect-passthrough";
const SLOT_TYPES: ReadonlySet<string> = new Set([
  "JSX.Element",
  "React.ReactElement",
  "React.ReactNode",
  "ReactElement",
  "ReactNode",
]);
const INTROSPECTING_MEMBERS: ReadonlySet<string> = new Set(["map", "props", "type"]);
const ELEMENT_HELPERS: ReadonlySet<string> = new Set(["cloneElement", "isValidElement"]);

interface Binding {
  readonly name: string;
  readonly identifier: Node & { name: string };
  readonly slot: boolean;
}

export const noIntrospectPassthrough: Rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow reading `children` or calling a function received as an argument inside a cached function.",
      recommended: false,
      url: ruleDocsUrl(RULE_NAME),
    },
    messages: {
      introspectChildren: `\`{{name}}\` is passed into {{scope}} as a reference. Pass it through without reading or transforming it; introspecting it inside a cached function isn't supported. See ${USE_CACHE_URL}`,
      callFunctionArg: `\`{{name}}\` is a function passed into {{scope}} \`{{fn}}\`. Functions can be passed through a cached function but not called inside it, and Next.js throws "Attempted to call a temporary Client Reference from the server". Call it outside, or pass its result as data. See ${USE_CACHE_URL}`,
    },
    schema: [],
  },
  createOnce(context) {
    return {
      before() {
        return textMentions(context.sourceCode.text, ["use cache"]);
      },
      "Program:exit"() {
        const analysis = analyze(context, getRuleOptions(context));
        for (const unit of analysis.units) {
          if (unit.cacheScope && unit.cacheScope.kind.type !== "unstable") {
            checkUnit(context, analysis, unit, unit.cacheScope);
          }
        }
      },
    };
  },
});

function checkUnit(
  context: Context,
  analysis: FileAnalysis,
  unit: FunctionInfo,
  scope: CacheScope,
): void {
  const reported = new Set<string>();
  const report = (
    messageId: "callFunctionArg" | "introspectChildren",
    name: string,
    node: Node,
  ): void => {
    if (reported.has(`${messageId}:${name}`)) {
      return;
    }
    reported.add(`${messageId}:${name}`);
    context.report({
      node,
      messageId,
      data: { name, scope: scopeLabel(scope.kind), fn: unit.name },
    });
  };
  const inScope = (node: Node): boolean => analysis.getCacheScope(node) === scope;

  for (const binding of collectBindings(unit)) {
    for (const reference of analysis.findVariable(binding.identifier)?.references ?? []) {
      const use = reference.identifier;
      if (reference.identifier === binding.identifier || !inScope(use)) {
        continue;
      }
      if (isCallee(use)) {
        report("callFunctionArg", binding.name, use);
      } else if (binding.slot && isIntrospection(use)) {
        report("introspectChildren", binding.name, use);
      }
    }
  }

  const props = unit.node.params[0];
  if (props?.type !== "Identifier" || !isPascalCase(unit.name)) {
    return;
  }
  for (const reference of analysis.findVariable(props)?.references ?? []) {
    const member = reference.identifier.parent;
    const name = getStaticPropertyName(member);
    if (member.type !== "MemberExpression" || member.object !== reference.identifier || !name) {
      continue;
    }
    if (!inScope(member)) {
      continue;
    }
    if (isCallee(member)) {
      report("callFunctionArg", `${props.name}.${name}`, member);
    } else if (name === "children" && isIntrospection(member)) {
      report("introspectChildren", `${props.name}.children`, member);
    }
  }
}

function collectBindings(unit: FunctionInfo): Binding[] {
  const bindings: Binding[] = [];
  unit.node.params.forEach((param, index) => {
    const target = param.type === "AssignmentPattern" ? param.left : param;
    if (target.type === "Identifier") {
      bindings.push({ name: target.name, identifier: target, slot: false });
    }
    if (target.type !== "ObjectPattern" || index > 0) {
      return;
    }
    const annotations = annotatedSlots(target);
    for (const property of target.properties) {
      if (property.type !== "Property" || property.computed || property.key.type !== "Identifier") {
        continue;
      }
      const value =
        property.value.type === "AssignmentPattern" ? property.value.left : property.value;
      if (value.type === "Identifier") {
        const name = property.key.name;
        const annotated = annotations.get(name);
        bindings.push({
          name,
          identifier: value,
          slot: annotated ?? (name === "children" && isPascalCase(unit.name)),
        });
      }
    }
  });
  return bindings;
}

function annotatedSlots(pattern: ESTree.ObjectPattern): Map<string, boolean> {
  const slots = new Map<string, boolean>();
  const literal = pattern.typeAnnotation?.typeAnnotation;
  if (literal?.type !== "TSTypeLiteral") {
    return slots;
  }
  for (const member of literal.members) {
    if (
      member.type === "TSPropertySignature" &&
      member.key.type === "Identifier" &&
      member.typeAnnotation
    ) {
      slots.set(member.key.name, isSlotType(member.typeAnnotation.typeAnnotation));
    }
  }
  return slots;
}

function isSlotType(type: ESTree.TSType): boolean {
  if (type.type === "TSUnionType") {
    return type.types.some(isSlotType);
  }
  return type.type === "TSTypeReference" && SLOT_TYPES.has(typeName(type.typeName));
}

function typeName(name: ESTree.TSTypeName): string {
  if (name.type === "Identifier") {
    return name.name;
  }
  if (name.type === "TSQualifiedName") {
    return `${typeName(name.left)}.${name.right.name}`;
  }
  return "";
}

function isCallee(node: Node): boolean {
  const outer = skipTransparentParents(node);
  return outer.parent?.type === "CallExpression" && outer.parent.callee === outer;
}

function isIntrospection(node: Node): boolean {
  const outer = skipTransparentParents(node);
  const parent = outer.parent;
  if (!parent) {
    return false;
  }
  if (parent.type === "MemberExpression" && parent.object === outer) {
    const property = getStaticPropertyName(parent);
    return property !== null && INTROSPECTING_MEMBERS.has(property);
  }
  if (parent.type === "UnaryExpression") {
    return parent.operator === "typeof";
  }
  if (parent.type !== "CallExpression" || !parent.arguments.includes(outer as ESTree.Argument)) {
    return false;
  }
  const path = getMemberPath(parent.callee) ?? [];
  const last = path.at(-1) ?? "";
  return (
    path.at(-2) === "Children" || ELEMENT_HELPERS.has(last) || path.join(".") === "Array.isArray"
  );
}
