import type { CallEdge, CallNode } from "./schema";

export interface GraphNode { node: CallNode; x: number; y: number }
export interface GraphLayout { nodes: GraphNode[]; width: number; height: number }
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 52;

/** Collapse cycles first; rank the resulting DAG so callers appear before callees. */
export function layoutGraph(nodes: CallNode[], edges: CallEdge[]): GraphLayout {
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const edge of edges) outgoing.get(edge.from)?.push(edge.to);
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: string[][] = [];
  function visit(id: string): void {
    indexes.set(id, nextIndex);
    low.set(id, nextIndex++);
    stack.push(id);
    onStack.add(id);
    for (const to of outgoing.get(id) ?? []) {
      if (!indexes.has(to)) {
        visit(to);
        low.set(id, Math.min(low.get(id)!, low.get(to)!));
      } else if (onStack.has(to)) low.set(id, Math.min(low.get(id)!, indexes.get(to)!));
    }
    if (low.get(id) === indexes.get(id)) {
      const group: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        group.push(member);
      } while (member !== id);
      groups.push(group);
    }
  }
  for (const node of nodes) if (!indexes.has(node.id)) visit(node.id);
  const groupOf = new Map<string, number>();
  groups.forEach((group, index) => group.forEach(id => groupOf.set(id, index)));
  const groupEdges = groups.map(() => new Set<number>());
  const indegrees = groups.map(() => 0);
  for (const edge of edges) {
    const from = groupOf.get(edge.from)!;
    const to = groupOf.get(edge.to)!;
    if (from !== to && !groupEdges[from]!.has(to)) {
      groupEdges[from]!.add(to);
      indegrees[to]!++;
    }
  }
  const ranks = groups.map(() => 0);
  const queue = indegrees.flatMap((degree, index) => degree === 0 ? [index] : []);
  for (let i = 0; i < queue.length; i++) {
    const group = queue[i]!;
    for (const to of groupEdges[group]!) {
      ranks[to] = Math.max(ranks[to]!, ranks[group]! + 1);
      if (--indegrees[to]! === 0) queue.push(to);
    }
  }
  const rows = new Map<number, number>();
  const positioned = nodes.map(node => {
    const rank = ranks[groupOf.get(node.id)!]!;
    const row = rows.get(rank) ?? 0;
    rows.set(rank, row + 1);
    return { node, x: 56 + rank * 300, y: 40 + row * 100 };
  });
  return {
    nodes: positioned,
    width: Math.max(320, ...positioned.map(node => node.x + NODE_WIDTH + 56)),
    height: Math.max(140, ...positioned.map(node => node.y + NODE_HEIGHT + 40))
  };
}
