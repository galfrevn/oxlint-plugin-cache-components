import type { Directive } from "./directives.ts";

export type FileKind =
  | "route-handler"
  | "proxy"
  | "segment"
  | "server-actions"
  | "client"
  | "other";

export type FnContext =
  | "server-action"
  | "route-handler"
  | "cached"
  | "component-render"
  | "build-time-generator"
  | "metadata"
  | "proxy"
  | "client"
  | "unknown";

export interface FileInfo {
  readonly kind: FileKind;
  readonly segment: string | null;
}

export const DEFAULT_APP_DIRS: readonly string[] = ["app", "src/app"];

export const HTTP_METHODS: ReadonlySet<string> = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

export const BUILD_TIME_GENERATORS: ReadonlySet<string> = new Set([
  "generateStaticParams",
  "unstable_generateParamMatching",
]);

export const METADATA_GENERATORS: ReadonlySet<string> = new Set([
  "generateMetadata",
  "generateViewport",
]);

export const RENDER_SEGMENTS: ReadonlySet<string> = new Set([
  "default",
  "forbidden",
  "global-not-found",
  "layout",
  "loading",
  "not-found",
  "page",
  "template",
  "unauthorized",
]);

const CLIENT_SEGMENTS: ReadonlySet<string> = new Set(["error", "global-error"]);
const PROXY_FILES: ReadonlySet<string> = new Set(["middleware", "proxy"]);
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/;
const SPECIAL_STEMS: ReadonlySet<string> = new Set([
  "route",
  ...RENDER_SEGMENTS,
  ...CLIENT_SEGMENTS,
  ...PROXY_FILES,
]);
const OTHER_FILE: FileInfo = { kind: "other", segment: null };

export function classifyFile(
  filename: string,
  cwd: string,
  appDirs: readonly string[],
  fileDirective: Directive | null,
): FileInfo {
  if (fileDirective?.type === "client") {
    return { kind: "client", segment: null };
  }
  if (fileDirective?.type === "server") {
    return { kind: "server-actions", segment: null };
  }
  if (!SPECIAL_STEMS.has(basenameOf(filename).replace(SOURCE_EXTENSION, ""))) {
    return OTHER_FILE;
  }

  const segments = relativeSegments(filename, cwd);
  const basename = segments.at(-1) ?? "";
  if (!SOURCE_EXTENSION.test(basename)) {
    return { kind: "other", segment: null };
  }
  const stem = basename.replace(SOURCE_EXTENSION, "");
  const directories = segments.slice(0, -1);
  const appDirSegments = appDirs.map(toSegments);

  const routeDirectories = findRouteDirectories(directories, appDirSegments);
  if (routeDirectories && !routeDirectories.some((directory) => directory.startsWith("_"))) {
    if (stem === "route") {
      return { kind: "route-handler", segment: stem };
    }
    if (RENDER_SEGMENTS.has(stem) || CLIENT_SEGMENTS.has(stem)) {
      return { kind: "segment", segment: stem };
    }
  }

  if (PROXY_FILES.has(stem) && isProjectRoot(directories, appDirSegments)) {
    return { kind: "proxy", segment: null };
  }
  return { kind: "other", segment: null };
}

export function toSegments(path: string): string[] {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

function basenameOf(filename: string): string {
  return filename.slice(Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\")) + 1);
}

function relativeSegments(filename: string, cwd: string): string[] {
  const file = toSegments(filename);
  const base = toSegments(cwd);
  const isInside = base.length > 0 && base.every((segment, index) => file[index] === segment);
  return isInside ? file.slice(base.length) : file;
}

function findRouteDirectories(
  directories: readonly string[],
  appDirs: readonly string[][],
): string[] | null {
  let best: number | null = null;
  for (const appDir of appDirs) {
    const end = findSequenceEnd(directories, appDir);
    if (end !== null && (best === null || end < best)) {
      best = end;
    }
  }
  return best === null ? null : directories.slice(best);
}

function findSequenceEnd(haystack: readonly string[], needle: readonly string[]): number | null {
  if (needle.length === 0) {
    return null;
  }
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((segment, offset) => haystack[start + offset] === segment)) {
      return start + needle.length;
    }
  }
  return null;
}

function isProjectRoot(directories: readonly string[], appDirs: readonly string[][]): boolean {
  const directory = directories.at(-1) === "src" ? directories.slice(0, -1) : directories;
  const roots = [[], ...appDirs.map(projectRootOf)];
  return roots.some(
    (root) =>
      root.length === directory.length &&
      root.every((segment, index) => directory[index] === segment),
  );
}

function projectRootOf(appDir: readonly string[]): string[] {
  const withoutApp = appDir.at(-1) === "app" ? appDir.slice(0, -1) : [...appDir];
  return withoutApp.at(-1) === "src" ? withoutApp.slice(0, -1) : withoutApp;
}
