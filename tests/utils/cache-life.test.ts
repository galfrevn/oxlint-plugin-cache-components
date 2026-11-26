import { describe, expect, it } from "vitest";

import { walk } from "../../src/utils/ast.ts";
import {
  BUILTIN_PROFILES,
  classifyCacheLife,
  parseCacheLifeCall,
  SHORT_EXPIRE_SECONDS,
} from "../../src/utils/cache-life.ts";
import { createProbe, probeCase } from "../helpers/probe.ts";
import { createTester } from "../helpers/tester.ts";

describe("BUILTIN_PROFILES", () => {
  it("matches the profile table in the cacheLife docs", () => {
    expect(BUILTIN_PROFILES).toEqual({
      default: { stale: 300, revalidate: 900, expire: Number.POSITIVE_INFINITY },
      seconds: { stale: 30, revalidate: 1, expire: 60 },
      minutes: { stale: 300, revalidate: 60, expire: 3600 },
      hours: { stale: 300, revalidate: 3600, expire: 86_400 },
      days: { stale: 300, revalidate: 86_400, expire: 604_800 },
      weeks: { stale: 300, revalidate: 604_800, expire: 2_592_000 },
      max: { stale: 300, revalidate: 2_592_000, expire: 31_536_000 },
    });
    expect(SHORT_EXPIRE_SECONDS).toBe(300);
  });
});

type Field = number | "dynamic" | "absent";

function inline(revalidate: Field, expire: Field): string {
  return classifyCacheLife({ kind: "inline", stale: "absent", revalidate, expire }, []);
}

describe("classifyCacheLife", () => {
  it("treats only the seconds preset as short-lived among the presets", () => {
    const short = Object.keys(BUILTIN_PROFILES).filter(
      (name) => classifyCacheLife({ kind: "profile", name }, []) !== "long",
    );
    expect(short).toEqual(["seconds"]);
  });

  it("uses shortProfiles for custom profiles", () => {
    expect(classifyCacheLife({ kind: "profile", name: "live" }, ["live"])).toBe("short-expire");
    expect(classifyCacheLife({ kind: "profile", name: "live" }, [])).toBe("unknown");
  });

  it("classifies inline profiles", () => {
    expect(inline(0, "absent")).toBe("zero-revalidate");
    expect(inline(0, 10)).toBe("zero-revalidate");
    expect(inline("absent", 299)).toBe("short-expire");
    expect(inline("dynamic", 60)).toBe("short-expire");
    expect(inline("absent", 300)).toBe("long");
    expect(inline(60, "absent")).toBe("long");
    expect(inline("dynamic", "absent")).toBe("unknown");
    expect(inline("absent", "dynamic")).toBe("unknown");
  });

  it("does not classify unknown calls", () => {
    expect(classifyCacheLife({ kind: "unknown" }, ["seconds"])).toBe("unknown");
  });
});

const probe = createProbe((context) => {
  const results: string[] = [];
  walk(
    context.sourceCode.ast,
    context.sourceCode.visitorKeys,
    (node) => {
      if (node.type === "CallExpression") {
        const parsed = parseCacheLifeCall(node);
        results.push(`${JSON.stringify(parsed)}=${classifyCacheLife(parsed, ["live"])}`);
      }
    },
    () => {},
  );
  return results;
});

createTester().run("parseCacheLifeCall", probe, {
  valid: [],
  invalid: [
    probeCase(
      `cacheLife("seconds"); cacheLife('hours'); cacheLife(\`live\`);`,
      [
        '{"kind":"profile","name":"seconds"}=short-expire',
        '{"kind":"profile","name":"hours"}=long',
        '{"kind":"profile","name":"live"}=short-expire',
      ],
      { name: "profiles" },
    ),
    probeCase(
      `cacheLife({ revalidate: 0 }); cacheLife({ expire: 60 * 4, stale: 30 }); cacheLife({ "expire": Infinity });`,
      [
        '{"kind":"inline","stale":"absent","revalidate":0,"expire":"absent"}=zero-revalidate',
        '{"kind":"inline","stale":30,"revalidate":"absent","expire":240}=short-expire',
        '{"kind":"inline","stale":"absent","revalidate":"absent","expire":null}=long',
      ],
      { name: "inline objects with literal arithmetic" },
    ),
    probeCase(
      `cacheLife({ ...base }); cacheLife({ revalidate: value }); cacheLife(profile); cacheLife(); cacheLife(...args);`,
      [
        '{"kind":"inline","stale":"dynamic","revalidate":"dynamic","expire":"dynamic"}=unknown',
        '{"kind":"inline","stale":"absent","revalidate":"dynamic","expire":"absent"}=unknown',
        '{"kind":"unknown"}=unknown',
        '{"kind":"unknown"}=unknown',
        '{"kind":"unknown"}=unknown',
      ],
      { name: "values that cannot be evaluated" },
    ),
  ],
});
