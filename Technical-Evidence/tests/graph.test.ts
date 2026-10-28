import { describe, expect, it } from "vitest";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "../src/graph";

const nodes = (...ids: string[]) => ids.map(id => ({ id, label: id }));

describe("call graph layout", () => {
  it("places callers to the left of callees, including branch joins", () => {
    const layout = layoutGraph(nodes("a", "b", "c", "d"), [
      { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }
    ]);
    const [a, b, c, d] = layout.nodes;
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBe(c!.x);
    expect(b!.y).not.toBe(c!.y);
    expect(d!.x).toBeGreaterThan(c!.x);
  });
  it("keeps mutually recursive functions together and continues after the cycle", () => {
    const layout = layoutGraph(nodes("entry", "a", "b", "exit"), [
      { from: "entry", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "exit" }
    ]);
    const [entry, a, b, exit] = layout.nodes;
    expect(a!.x).toBe(b!.x);
    expect(a!.y).not.toBe(b!.y);
    expect(entry!.x).toBeLessThan(a!.x);
    expect(exit!.x).toBeGreaterThan(a!.x);
  });
  it("handles self-recursion, disconnected functions and an empty graph", () => {
    const layout = layoutGraph(nodes("recursive", "isolated"), [{ from: "recursive", to: "recursive" }]);
    expect(layout.nodes).toHaveLength(2);
    expect(new Set(layout.nodes.map(node => `${node.x},${node.y}`)).size).toBe(2);
    for (const node of layout.nodes) {
      expect(node.x + NODE_WIDTH).toBeLessThan(layout.width);
      expect(node.y + NODE_HEIGHT).toBeLessThan(layout.height);
    }
    expect(layoutGraph([], []).nodes).toEqual([]);
  });
});
