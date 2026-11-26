import packageJson from "../../package.json" with { type: "json" };
import type { CacheKind } from "./directives.ts";

export const CACHE_LIFE_OUTSIDE_USE_CACHE_URL =
  "https://nextjs.org/docs/messages/cache-life-outside-use-cache";
export const CACHE_TAG_OUTSIDE_USE_CACHE_URL =
  "https://nextjs.org/docs/messages/cache-tag-outside-use-cache";
export const DATA_SECURITY_URL = "https://nextjs.org/docs/app/guides/data-security";
export const NESTED_CACHE_LIFE_URL =
  "https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife";
export const NEXT_REQUEST_IN_USE_CACHE_URL =
  "https://nextjs.org/docs/messages/next-request-in-use-cache";
export const REFRESH_URL = "https://nextjs.org/docs/app/api-reference/functions/refresh";
export const REVALIDATE_IN_USE_CACHE_URL =
  "https://nextjs.org/docs/messages/revalidate-in-use-cache";
export const REVALIDATE_PATH_URL =
  "https://nextjs.org/docs/app/api-reference/functions/revalidatePath";
export const REVALIDATE_TAG_URL =
  "https://nextjs.org/docs/app/api-reference/functions/revalidateTag";
export const REVALIDATE_TAG_SINGLE_ARG_URL =
  "https://nextjs.org/docs/messages/revalidate-tag-single-arg";
export const UNSTABLE_CACHE_URL =
  "https://nextjs.org/docs/app/api-reference/functions/unstable_cache";
export const UPDATE_TAG_URL = "https://nextjs.org/docs/app/api-reference/functions/updateTag";
export const USE_CACHE_URL = "https://nextjs.org/docs/app/api-reference/directives/use-cache";
export const USE_CACHE_PRIVATE_URL =
  "https://nextjs.org/docs/app/api-reference/directives/use-cache-private";
export const USE_CACHE_PRIVATE_COMPOSITION_URL =
  "https://nextjs.org/docs/messages/use-cache-private-composition";
export const USE_CACHE_REMOTE_URL =
  "https://nextjs.org/docs/app/api-reference/directives/use-cache-remote";

const REPOSITORY_URL = "https://github.com/galfrevn/oxlint-plugin-cache-components";

export function scopeLabel(kind: CacheKind): string {
  switch (kind.type) {
    case "public":
      return '"use cache"';
    case "remote":
      return '"use cache: remote"';
    case "private":
      return '"use cache: private"';
    case "custom":
      return `"use cache: ${kind.name}"`;
    case "unstable":
      return "`unstable_cache()`";
  }
}

export function requestApiUrl(kind: CacheKind): string {
  return kind.type === "unstable" ? UNSTABLE_CACHE_URL : NEXT_REQUEST_IN_USE_CACHE_URL;
}

export function ruleDocsUrl(rule: string): string {
  return `${REPOSITORY_URL}/blob/v${packageJson.version}/docs/rules/${rule}.md`;
}
