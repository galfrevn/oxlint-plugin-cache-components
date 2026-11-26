import { describe, expect, it } from "vitest";

import type { FunctionNode } from "../../src/utils/ast.ts";
import { createCallGraph } from "../../src/utils/call-graph.ts";
import type { CallSite } from "../../src/utils/call-graph.ts";

function fakeFunction(name: string): FunctionNode {
  return { type: "FunctionDeclaration", name } as unknown as FunctionNode;
}

function edge(caller: FunctionNode, callee: FunctionNode): CallSite {
  return { caller, callee, node: {} as CallSite["node"], awaited: false };
}

function names(fns: readonly { fn: FunctionNode }[]): unknown[] {
  return fns.map(({ fn }) => (fn as unknown as { name: string }).name);
}

describe("createCallGraph", () => {
  const a = fakeFunction("a");
  const b = fakeFunction("b");
  const c = fakeFunction("c");
  const d = fakeFunction("d");
  const graph = createCallGraph([edge(a, b), edge(b, c), edge(c, a), edge(c, d)]);

  it("indexes callers and callees", () => {
    expect(graph.callsFrom(a)).toHaveLength(1);
    expect(graph.callersOf(a)).toHaveLength(1);
    expect(graph.callsFrom(null)).toHaveLength(0);
  });

  it("walks cycles without revisiting functions", () => {
    expect(names(graph.reachableFrom(a))).toEqual(["b", "c", "d"]);
  });

  it("records the path from the start", () => {
    const reached = graph.reachableFrom(a).find(({ fn }) => fn === d);
    expect(reached?.path.map((site) => site.callee)).toEqual([b, c, d]);
  });

  it("respects the maximum depth", () => {
    expect(names(graph.reachableFrom(a, { maxDepth: 1 }))).toEqual(["b"]);
  });

  it("does not expand past stop functions", () => {
    expect(names(graph.reachableFrom(a, { stopAt: (fn) => fn === b }))).toEqual(["b"]);
  });
});
