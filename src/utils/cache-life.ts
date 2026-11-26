import type { ESTree } from "@oxlint/plugins";

import { getStringValue, unwrapExpression } from "./ast.ts";
import type { Node } from "./ast.ts";

export interface CacheLifeProfile {
  readonly stale: number;
  readonly revalidate: number;
  readonly expire: number;
}

export type NumericField = number | "dynamic" | "absent";

export type ParsedCacheLife =
  | { readonly kind: "profile"; readonly name: string }
  | {
      readonly kind: "inline";
      readonly stale: NumericField;
      readonly revalidate: NumericField;
      readonly expire: NumericField;
    }
  | { readonly kind: "unknown" };

export type CacheLifeClass = "zero-revalidate" | "short-expire" | "long" | "unknown";

export const SHORT_EXPIRE_SECONDS = 300;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const BUILTIN_PROFILES: Readonly<Record<string, CacheLifeProfile>> = {
  default: { stale: 5 * MINUTE, revalidate: 15 * MINUTE, expire: Number.POSITIVE_INFINITY },
  seconds: { stale: 30, revalidate: 1, expire: MINUTE },
  minutes: { stale: 5 * MINUTE, revalidate: MINUTE, expire: HOUR },
  hours: { stale: 5 * MINUTE, revalidate: HOUR, expire: DAY },
  days: { stale: 5 * MINUTE, revalidate: DAY, expire: 7 * DAY },
  weeks: { stale: 5 * MINUTE, revalidate: 7 * DAY, expire: 30 * DAY },
  max: { stale: 5 * MINUTE, revalidate: 30 * DAY, expire: 365 * DAY },
};

const INLINE_FIELDS = ["stale", "revalidate", "expire"] as const;

type InlineField = (typeof INLINE_FIELDS)[number];

export function parseCacheLifeCall(call: ESTree.CallExpression): ParsedCacheLife {
  const argument = call.arguments[0];
  if (!argument || argument.type === "SpreadElement") {
    return { kind: "unknown" };
  }
  const name = getStringValue(argument);
  if (name !== null) {
    return { kind: "profile", name };
  }
  const target = unwrapExpression(argument);
  if (target.type !== "ObjectExpression") {
    return { kind: "unknown" };
  }
  const fields: Record<InlineField, NumericField> = {
    stale: "absent",
    revalidate: "absent",
    expire: "absent",
  };
  let hasSpread = false;
  for (const property of target.properties) {
    if (property.type === "SpreadElement") {
      hasSpread = true;
      continue;
    }
    const key = getPropertyKey(property);
    if (key !== null && isInlineField(key)) {
      fields[key] = evaluateNumber(property.value) ?? "dynamic";
    }
  }
  if (hasSpread) {
    for (const field of INLINE_FIELDS) {
      if (fields[field] === "absent") {
        fields[field] = "dynamic";
      }
    }
  }
  return { kind: "inline", ...fields };
}

export function classifyCacheLife(
  parsed: ParsedCacheLife,
  shortProfiles: readonly string[],
): CacheLifeClass {
  if (parsed.kind === "unknown") {
    return "unknown";
  }
  if (parsed.kind === "profile") {
    if (shortProfiles.includes(parsed.name)) {
      return "short-expire";
    }
    const profile = BUILTIN_PROFILES[parsed.name];
    return profile ? classifyValues(profile.revalidate, profile.expire) : "unknown";
  }
  if (parsed.revalidate === 0) {
    return "zero-revalidate";
  }
  if (typeof parsed.expire === "number" && parsed.expire < SHORT_EXPIRE_SECONDS) {
    return "short-expire";
  }
  if (parsed.revalidate === "dynamic" || parsed.expire === "dynamic") {
    return "unknown";
  }
  return "long";
}

export function evaluateNumber(node: Node): number | null {
  const target = unwrapExpression(node);
  switch (target.type) {
    case "Literal":
      return typeof target.value === "number" ? target.value : null;
    case "Identifier":
      return target.name === "Infinity" ? Number.POSITIVE_INFINITY : null;
    case "UnaryExpression": {
      const value = evaluateNumber(target.argument);
      if (value === null) {
        return null;
      }
      if (target.operator === "-") {
        return -value;
      }
      return target.operator === "+" ? value : null;
    }
    case "BinaryExpression": {
      if (target.left.type === "PrivateIdentifier") {
        return null;
      }
      const left = evaluateNumber(target.left);
      const right = evaluateNumber(target.right);
      return left === null || right === null ? null : applyOperator(target.operator, left, right);
    }
    default:
      return null;
  }
}

function classifyValues(revalidate: number, expire: number): CacheLifeClass {
  if (revalidate === 0) {
    return "zero-revalidate";
  }
  return expire < SHORT_EXPIRE_SECONDS ? "short-expire" : "long";
}

function applyOperator(operator: string, left: number, right: number): number | null {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    default:
      return null;
  }
}

function getPropertyKey(property: ESTree.ObjectProperty): string | null {
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  return getStringValue(property.key);
}

function isInlineField(key: string): key is InlineField {
  return (INLINE_FIELDS as readonly string[]).includes(key);
}
