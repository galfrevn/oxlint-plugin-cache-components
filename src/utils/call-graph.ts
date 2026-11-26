import type { ESTree } from "@oxlint/plugins";

import type { FunctionNode } from "./ast.ts";

export interface CallSite {
  readonly caller: FunctionNode | null;
  readonly callee: FunctionNode;
  readonly node: ESTree.CallExpression | ESTree.JSXOpeningElement;
  readonly awaited: boolean;
}

export interface Reachable {
  readonly fn: FunctionNode;
  readonly path: readonly CallSite[];
}

export interface ReachOptions {
  readonly maxDepth?: number;
  readonly stopAt?: (fn: FunctionNode) => boolean;
}

export interface CallGraph {
  readonly sites: readonly CallSite[];
  callsFrom(fn: FunctionNode | null): readonly CallSite[];
  callersOf(fn: FunctionNode): readonly CallSite[];
  reachableFrom(fn: FunctionNode, options?: ReachOptions): Reachable[];
}

export const DEFAULT_MAX_DEPTH = 10;

const EMPTY: readonly CallSite[] = [];

export function createCallGraph(sites: readonly CallSite[]): CallGraph {
  const outgoing = new Map<FunctionNode | null, CallSite[]>();
  const incoming = new Map<FunctionNode, CallSite[]>();
  for (const site of sites) {
    append(outgoing, site.caller, site);
    append(incoming, site.callee, site);
  }

  const callsFrom = (fn: FunctionNode | null): readonly CallSite[] => outgoing.get(fn) ?? EMPTY;

  return {
    sites,
    callsFrom,
    callersOf: (fn) => incoming.get(fn) ?? EMPTY,
    reachableFrom(start, options = {}) {
      const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
      const visited = new Set<FunctionNode>([start]);
      const reached: Reachable[] = [];
      let frontier: Reachable[] = [{ fn: start, path: [] }];

      while (frontier.length > 0) {
        const next: Reachable[] = [];
        for (const { fn, path } of frontier) {
          if (path.length >= maxDepth) {
            continue;
          }
          for (const site of callsFrom(fn)) {
            if (visited.has(site.callee)) {
              continue;
            }
            visited.add(site.callee);
            const entry = { fn: site.callee, path: [...path, site] };
            reached.push(entry);
            if (!options.stopAt?.(site.callee)) {
              next.push(entry);
            }
          }
        }
        frontier = next;
      }
      return reached;
    },
  };
}

function append<K>(map: Map<K, CallSite[]>, key: K, site: CallSite): void {
  const list = map.get(key);
  if (list) {
    list.push(site);
  } else {
    map.set(key, [site]);
  }
}
