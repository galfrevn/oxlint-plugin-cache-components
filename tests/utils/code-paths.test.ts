import { describe, expect, it } from "vitest";

import type { Node } from "../../src/utils/ast.ts";
import { createCodePathTracker } from "../../src/utils/code-paths.ts";
import type { CodePathTracker, Segment } from "../../src/utils/code-paths.ts";

interface MutableSegment {
  readonly id: string;
  prevSegments: Segment[];
}

function segment(id: string, prevSegments: Segment[] = []): MutableSegment {
  return { id, prevSegments };
}

function fakeNode(start: number): Node {
  return { range: [start, start + 1] } as unknown as Node;
}

function recordIn(tracker: CodePathTracker, owner: Segment, node: Node): Node {
  tracker.visitors.onCodePathSegmentStart(owner);
  tracker.record(node);
  tracker.visitors.onCodePathSegmentEnd();
  return node;
}

function fakeFunction(start: number, end: number, parent: Node | null): Node {
  return { type: "ArrowFunctionExpression", range: [start, end], parent } as unknown as Node;
}

function fakeChild(start: number, parent: Node): Node {
  return { range: [start, start + 1], parent } as unknown as Node;
}

function startCallback(tracker: CodePathTracker, owner: Segment, callback: Node): void {
  tracker.visitors.onCodePathSegmentStart(owner);
  tracker.visitors.onCodePathStart(null, callback);
}

function chainOfBranches(entry: Segment, count: number): Segment {
  let join = entry;
  for (let index = 0; index < count; index += 1) {
    const consequent = segment(`consequent-${index}`, [join]);
    join = segment(`join-${index}`, [join, consequent]);
  }
  return join;
}

describe("createCodePathTracker", () => {
  it("accepts a check earlier in the same segment", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const check = recordIn(tracker, entry, fakeNode(1));
    const target = recordIn(tracker, entry, fakeNode(10));
    expect(tracker.dominates([check], target)).toBe(true);
  });

  it("rejects a check later in the same segment", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const target = recordIn(tracker, entry, fakeNode(1));
    const check = recordIn(tracker, entry, fakeNode(10));
    expect(tracker.dominates([check], target)).toBe(false);
  });

  it("rejects a target with no checks", () => {
    const tracker = createCodePathTracker();
    const last = chainOfBranches(segment("entry"), 3);
    const target = recordIn(tracker, last, fakeNode(10));
    expect(tracker.dominates([], target)).toBe(false);
  });

  it("rejects a check that runs on one branch only", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const consequent = segment("consequent", [entry]);
    const join = segment("join", [entry, consequent]);
    const check = recordIn(tracker, consequent, fakeNode(1));
    const target = recordIn(tracker, join, fakeNode(10));
    expect(tracker.dominates([check], target)).toBe(false);
  });

  it("accepts a check that runs before 64 branches in linear time", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const check = recordIn(tracker, entry, fakeNode(1));
    const target = recordIn(tracker, chainOfBranches(entry, 64), fakeNode(10));
    expect(tracker.dominates([check], target)).toBe(true);
  });

  it("rejects a check skipped by one of 64 branches", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const guarded = segment("guarded", [entry]);
    const check = recordIn(tracker, guarded, fakeNode(1));
    const join = segment("join", [entry, guarded]);
    const target = recordIn(tracker, chainOfBranches(join, 64), fakeNode(10));
    expect(tracker.dominates([check], target)).toBe(false);
  });

  it("accepts a check before a loop that reaches the target", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const loop = segment("loop", [entry]);
    const body = segment("body", [loop]);
    loop.prevSegments.push(body);
    const check = recordIn(tracker, entry, fakeNode(1));
    const target = recordIn(tracker, body, fakeNode(10));
    expect(tracker.dominates([check], target)).toBe(true);
  });

  it("forgets recorded nodes on reset", () => {
    const tracker = createCodePathTracker();
    const entry = segment("entry");
    const check = recordIn(tracker, entry, fakeNode(1));
    const target = recordIn(tracker, entry, fakeNode(10));
    tracker.reset();
    expect(tracker.dominates([check], target)).toBe(false);
  });
  it("accepts a check that runs before a callback is created", () => {
    const tracker = createCodePathTracker();
    const root = fakeFunction(0, 100, null);
    const entry = segment("entry");
    const check = recordIn(tracker, entry, fakeChild(1, root));
    const callback = fakeFunction(20, 40, root);
    startCallback(tracker, entry, callback);
    const target = recordIn(tracker, segment("callback"), fakeChild(30, callback));
    expect(tracker.dominates([check], target)).toBe(false);
    expect(tracker.dominatesFrom([check], target, root)).toBe(true);
  });

  it("rejects a check that runs on one branch before a callback is created", () => {
    const tracker = createCodePathTracker();
    const root = fakeFunction(0, 100, null);
    const entry = segment("entry");
    const consequent = segment("consequent", [entry]);
    const join = segment("join", [entry, consequent]);
    const check = recordIn(tracker, consequent, fakeChild(1, root));
    const callback = fakeFunction(20, 40, root);
    startCallback(tracker, join, callback);
    const target = recordIn(tracker, segment("callback"), fakeChild(30, callback));
    expect(tracker.dominatesFrom([check], target, root)).toBe(false);
  });
});
