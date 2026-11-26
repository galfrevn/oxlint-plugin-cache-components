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
        targetSegment.prevSegments.every((segment) => isCheckedOnExit(segment, checked, new Set()))
      );
    },
  };
}

function isCheckedOnExit(
  segment: Segment,
  checked: ReadonlySet<Segment>,
  visiting: Set<Segment>,
): boolean {
  if (checked.has(segment) || visiting.has(segment)) {
    return true;
  }
  if (segment.prevSegments.length === 0) {
    return false;
  }
  visiting.add(segment);
  const result = segment.prevSegments.every((previous) =>
    isCheckedOnExit(previous, checked, visiting),
  );
  visiting.delete(segment);
  return result;
}

function isSegment(value: unknown): value is Segment {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Segment).id === "string" &&
    Array.isArray((value as Segment).prevSegments)
  );
}
