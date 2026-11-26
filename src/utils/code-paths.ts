import type { Node } from "./ast.ts";

export interface Segment {
  readonly id: string;
  readonly prevSegments: readonly Segment[];
}

export interface CodePathTracker {
  readonly visitors: {
    readonly onCodePathSegmentStart: (segment: unknown) => void;
    readonly onCodePathSegmentEnd: () => void;
    readonly onUnreachableCodePathSegmentStart: (segment: unknown) => void;
    readonly onUnreachableCodePathSegmentEnd: () => void;
  };
  record(node: Node): void;
  reset(): void;
  dominates(checks: readonly Node[], target: Node): boolean;
}

export function createCodePathTracker(): CodePathTracker {
  const stack: (Segment | null)[] = [];
  let segments = new Map<Node, Segment>();
  const enter = (segment: unknown): void => {
    stack.push(isSegment(segment) ? segment : null);
  };
  const leave = (): void => {
    stack.pop();
  };

  return {
    visitors: {
      onCodePathSegmentStart: enter,
      onCodePathSegmentEnd: leave,
      onUnreachableCodePathSegmentStart: enter,
      onUnreachableCodePathSegmentEnd: leave,
    },
    record(node) {
      const segment = stack.at(-1);
      if (segment) {
        segments.set(node, segment);
      }
    },
    reset() {
      stack.length = 0;
      segments = new Map();
    },
    dominates(checks, target) {
      const targetSegment = segments.get(target);
      if (!targetSegment) {
        return false;
      }
      const checked = new Set<Segment>();
      for (const check of checks) {
        const segment = segments.get(check);
        if (segment === targetSegment && check.range[1] <= target.range[0]) {
          return true;
        }
        if (segment && segment !== targetSegment) {
          checked.add(segment);
        }
      }
      return (
        targetSegment.prevSegments.length > 0 &&
        !reachesEntryUnchecked(targetSegment.prevSegments, checked)
      );
    },
  };
}

function reachesEntryUnchecked(start: readonly Segment[], checked: ReadonlySet<Segment>): boolean {
  const seen = new Set<Segment>();
  const pending = [...start];
  for (let segment = pending.pop(); segment; segment = pending.pop()) {
    if (checked.has(segment) || seen.has(segment)) {
      continue;
    }
    if (segment.prevSegments.length === 0) {
      return true;
    }
    seen.add(segment);
    pending.push(...segment.prevSegments);
  }
  return false;
}

function isSegment(value: unknown): value is Segment {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Segment).id === "string" &&
    Array.isArray((value as Segment).prevSegments)
  );
}
