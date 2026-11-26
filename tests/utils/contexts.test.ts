import { describe, expect, it } from "vitest";

import { classifyFile, DEFAULT_APP_DIRS } from "../../src/utils/contexts.ts";
import type { Directive } from "../../src/utils/directives.ts";

const CWD = "/repo";

function kindOf(path: string, appDirs: readonly string[] = DEFAULT_APP_DIRS): string {
  const info = classifyFile(`${CWD}/${path}`, CWD, appDirs, null);
  return info.segment ? `${info.kind}:${info.segment}` : info.kind;
}

describe("classifyFile", () => {
  it.each([
    ["app/api/posts/route.ts", "route-handler:route"],
    ["app/api/posts/route.js", "route-handler:route"],
    ["src/app/api/posts/route.tsx", "route-handler:route"],
    ["app/(shop)/products/[id]/page.tsx", "segment:page"],
    ["src/app/layout.tsx", "segment:layout"],
    ["app/@modal/default.tsx", "segment:default"],
    ["app/not-found.tsx", "segment:not-found"],
    ["app/error.tsx", "segment:error"],
    ["apps/web/app/blog/page.tsx", "segment:page"],
    ["proxy.ts", "proxy"],
    ["src/proxy.ts", "proxy"],
    ["middleware.ts", "proxy"],
    ["src/middleware.js", "proxy"],
    ["lib/route.ts", "other"],
    ["lib/middleware.ts", "other"],
    ["app/_lib/route.ts", "other"],
    ["app/blog/page.md", "other"],
    ["components/page.tsx", "other"],
  ])("classifies %s as %s", (path, expected) => {
    expect(kindOf(path)).toBe(expected);
  });

  it("finds proxy files next to a configured app directory", () => {
    expect(kindOf("apps/web/proxy.ts", ["apps/web/app"])).toBe("proxy");
    expect(kindOf("apps/web/src/middleware.ts", ["apps/web/src/app"])).toBe("proxy");
    expect(kindOf("apps/web/proxy.ts")).toBe("other");
  });

  it("restricts app directories when they are configured", () => {
    expect(kindOf("packages/ui/app/page.tsx", ["apps/web/app"])).toBe("other");
    expect(kindOf("apps/web/app/page.tsx", ["apps/web/app"])).toBe("segment:page");
  });

  it("uses the absolute path when the file is outside the working directory", () => {
    expect(classifyFile("/other/app/page.tsx", CWD, DEFAULT_APP_DIRS, null).kind).toBe("segment");
  });

  it("normalizes Windows separators", () => {
    expect(classifyFile("C:\\repo\\app\\route.ts", "C:\\repo", DEFAULT_APP_DIRS, null).kind).toBe(
      "route-handler",
    );
  });

  it("gives file directives precedence over the path", () => {
    const server: Directive = { type: "server", node: {} as Directive["node"] };
    const client: Directive = { type: "client", node: {} as Directive["node"] };
    expect(classifyFile(`${CWD}/app/page.tsx`, CWD, DEFAULT_APP_DIRS, client).kind).toBe("client");
    expect(classifyFile(`${CWD}/app/actions.ts`, CWD, DEFAULT_APP_DIRS, server).kind).toBe(
      "server-actions",
    );
  });
});
