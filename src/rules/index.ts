import type { Rule } from "@oxlint/plugins";

import { noCacheApiOutsideCache } from "./no-cache-api-outside-cache.ts";
import { noIntrospectPassthrough } from "./no-introspect-passthrough.ts";
import { noInvalidCacheNesting } from "./no-invalid-cache-nesting.ts";
import { noLegacySegmentConfig } from "./no-legacy-segment-config.ts";
import { noPromiseArgsToCache } from "./no-promise-args-to-cache.ts";
import { noReactCacheAcrossBoundary } from "./no-react-cache-across-boundary.ts";
import { noRequestApiInCache } from "./no-request-api-in-cache.ts";
import { requireAuthBeforeRevalidate } from "./require-auth-before-revalidate.ts";
import { requireCacheLifeWhenNested } from "./require-cachelife-when-nested.ts";
import { requireRevalidatePathType } from "./require-revalidate-path-type.ts";
import { requireRevalidateTagProfile } from "./require-revalidate-tag-profile.ts";
import { serializableCacheArgs } from "./serializable-cache-args.ts";
import { validInvalidationContext } from "./valid-invalidation-context.ts";

export type Severity = "error" | "warn";

export type RuleSetting = Severity | [Severity, ...unknown[]];

export type PresetName = "all" | "migration" | "recommended" | "strict";

export const PLUGIN_NAME = "cache-components";

export interface RuleEntry {
  readonly rule: Rule;
  readonly presets: Readonly<Partial<Record<Exclude<PresetName, "all">, Severity>>>;
  readonly presetOptions?: readonly unknown[];
}

const CORE: RuleEntry["presets"] = { recommended: "error", strict: "error" };
const CORE_WARNING: RuleEntry["presets"] = { recommended: "warn", strict: "error" };
const HEURISTIC: RuleEntry["presets"] = { strict: "warn" };

export const RULES: Readonly<Record<string, RuleEntry>> = {
  "no-request-api-in-cache": { rule: noRequestApiInCache, presets: CORE },
  "no-cache-api-outside-cache": { rule: noCacheApiOutsideCache, presets: CORE },
  "require-cachelife-when-nested": { rule: requireCacheLifeWhenNested, presets: CORE },
  "no-invalid-cache-nesting": { rule: noInvalidCacheNesting, presets: CORE },
  "valid-invalidation-context": { rule: validInvalidationContext, presets: CORE },
  "no-promise-args-to-cache": { rule: noPromiseArgsToCache, presets: CORE },
  "require-revalidate-tag-profile": { rule: requireRevalidateTagProfile, presets: CORE_WARNING },
  "require-revalidate-path-type": { rule: requireRevalidatePathType, presets: CORE_WARNING },
  "require-auth-before-revalidate": { rule: requireAuthBeforeRevalidate, presets: CORE_WARNING },
  "no-legacy-segment-config": {
    rule: noLegacySegmentConfig,
    presets: { migration: "error" },
    presetOptions: [{ cacheComponents: true }],
  },
  "no-introspect-passthrough": { rule: noIntrospectPassthrough, presets: HEURISTIC },
  "serializable-cache-args": { rule: serializableCacheArgs, presets: HEURISTIC },
  "no-react-cache-across-boundary": { rule: noReactCacheAcrossBoundary, presets: HEURISTIC },
};

export function presetRules(preset: PresetName): Record<string, RuleSetting> {
  const rules: Record<string, RuleSetting> = {};
  for (const [name, entry] of Object.entries(RULES)) {
    const severity = preset === "all" ? "error" : entry.presets[preset];
    if (severity) {
      rules[`${PLUGIN_NAME}/${name}`] =
        entry.presetOptions && preset !== "all" ? [severity, ...entry.presetOptions] : severity;
    }
  }
  return rules;
}
