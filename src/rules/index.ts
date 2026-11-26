import type { Rule } from "@oxlint/plugins";

import { noRequestApiInCache } from "./no-request-api-in-cache.ts";

export type Severity = "error" | "warn";

export interface RuleEntry {
  readonly rule: Rule;
  readonly recommended: Severity;
}

export const RULES: Readonly<Record<string, RuleEntry>> = {
  "no-request-api-in-cache": { rule: noRequestApiInCache, recommended: "error" },
};
