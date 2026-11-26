import type { Context } from "@oxlint/plugins";

import { getFileAnalysis } from "./analysis.ts";
import type { FileAnalysis } from "./analysis.ts";
import { DEFAULT_APP_DIRS } from "./contexts.ts";

export const SETTINGS_KEY = "cache-components";

export type SharedOption =
  | "appDir"
  | "authFunctions"
  | "authWrappers"
  | "requestApis"
  | "shortProfiles";

export type RuleOptions = Readonly<Record<string, unknown>>;

export const STRING_LIST_SCHEMA = {
  type: "array",
  items: { type: "string", minLength: 1 },
  uniqueItems: true,
} as const;

export function getRuleOptions(context: Context): RuleOptions {
  const first: unknown = context.options[0];
  return isRecord(first) ? first : {};
}

export function getStringList(
  context: Context,
  options: RuleOptions,
  key: SharedOption,
): readonly string[] | undefined {
  const fromRule = options[key];
  if (isStringList(fromRule)) {
    return fromRule;
  }
  const settings: unknown = context.settings[SETTINGS_KEY];
  if (settings === undefined) {
    return undefined;
  }
  if (!isRecord(settings)) {
    throw new TypeError(`settings["${SETTINGS_KEY}"] must be an object.`);
  }
  const value = settings[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isStringList(value)) {
    throw new TypeError(`settings["${SETTINGS_KEY}"].${key} must be an array of strings.`);
  }
  return value;
}

export function getBoolean(options: RuleOptions, key: string, fallback: boolean): boolean {
  const value = options[key];
  return typeof value === "boolean" ? value : fallback;
}

export function analyze(context: Context, options: RuleOptions): FileAnalysis {
  return getFileAnalysis(
    { sourceCode: context.sourceCode, filename: context.filename, cwd: context.cwd },
    {
      appDirs: getStringList(context, options, "appDir") ?? DEFAULT_APP_DIRS,
      requestApis: getStringList(context, options, "requestApis") ?? [],
    },
  );
}

export function textMentions(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
