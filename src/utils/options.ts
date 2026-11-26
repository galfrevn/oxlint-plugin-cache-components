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

export function getOwnStringList(options: RuleOptions, key: string): readonly string[] | undefined {
  const value = options[key];
  return isStringList(value) ? value : undefined;
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

const RELEVANCE_MARKERS: readonly string[] = ["next/", "use cache"];

let mentionText = "";
let mentionCache = new Map<string, boolean>();

export function textMentions(text: string, ...groups: readonly (readonly string[])[]): boolean {
  if (text !== mentionText) {
    mentionText = text;
    mentionCache = new Map();
  }
  if (!RELEVANCE_MARKERS.some((marker) => mentions(text, marker))) {
    return false;
  }
  return groups.every((needles) => needles.some((needle) => mentions(text, needle)));
}

function mentions(text: string, needle: string): boolean {
  let found = mentionCache.get(needle);
  if (found === undefined) {
    found = text.includes(needle);
    mentionCache.set(needle, found);
  }
  return found;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
