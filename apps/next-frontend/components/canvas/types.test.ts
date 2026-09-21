import { describe, expect, it } from "vitest";
import type { Block, BlockConnection } from "@/lib/types";
import { anchorConnections, canvasAnchorMap, groupCanvasBlocks } from "./types";

function block(id: string, type: string): Block {
  return { id, type, properties: { text: id } };
}

function conn(from: string, to: string): BlockConnection {
  return { from_id: from, to_id: to };
}

describe("groupCanvasBlocks", () => {
  it("merges a consecutive To-Do run into one card (the spec example)", () => {
    // header → 3 todos → line break (divider) → paragraph → 1 todo
    const blocks = [
      block("h", "header-1"),
      block("t1", "todo"),
      block("t2", "todo"),
      block("t3", "todo"),
      block("d", "divider"),
      block("p", "text"),
      block("t4", "todo"),
    ];
    const cards = groupCanvasBlocks(blocks);
    expect(cards.map((c) => c.id)).toEqual(["h", "t1", "p", "t4"]);
    expect(cards[0].blocks).toHaveLength(1);
    expect(cards[1].blocks.map((b) => b.id)).toEqual(["t1", "t2", "t3"]);
    expect(cards[2].blocks).toHaveLength(1);
    expect(cards[3].blocks).toHaveLength(1);
  });

  it("merges mixed todo/list-item runs into one card", () => {
    const cards = groupCanvasBlocks([
      block("a", "todo"),
      block("b", "list-item"),
      block("c", "todo"),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("a");
    expect(cards[0].blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("an anchor is the run's FIRST member — not the newest block", () => {
    const cards = groupCanvasBlocks([block("x", "todo"), block("y", "todo")]);
    expect(cards[0].id).toBe("x");
  });

  it("non-list blocks break runs and keep their own cards", () => {
    const cards = groupCanvasBlocks([
      block("t1", "todo"),
      block("p", "text"),
      block("t2", "todo"),
    ]);
    expect(cards.map((c) => c.id)).toEqual(["t1", "p", "t2"]);
    expect(cards.every((c) => c.blocks)).toBe(true);
  });

  it("leading/trailing dividers yield no empty cards", () => {
    const cards = groupCanvasBlocks([
      block("d1", "divider"),
      block("t1", "todo"),
      block("d2", "divider"),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].blocks.map((b) => b.id)).toEqual(["t1"]);
  });

  it("handles an empty document", () => {
    expect(groupCanvasBlocks([])).toEqual([]);
  });
});

describe("canvasAnchorMap", () => {
  it("maps every member to its card anchor", () => {
    const map = canvasAnchorMap([
      block("h", "header-1"),
      block("t1", "todo"),
      block("t2", "todo"),
    ]);
    expect(map.get("h")).toBe("h");
    expect(map.get("t1")).toBe("t1");
    expect(map.get("t2")).toBe("t1");
  });
});

describe("anchorConnections", () => {
  it("re-points legacy edges at run anchors", () => {
    const blocks = [block("t1", "todo"), block("t2", "todo"), block("h", "header-1")];
    const next = anchorConnections([conn("t2", "h")], blocks);
    expect(next).toEqual([conn("t1", "h")]);
  });

  it("drops edges whose endpoints collapse onto the same card", () => {
    const blocks = [block("t1", "todo"), block("t2", "todo")];
    expect(anchorConnections([conn("t1", "t2")], blocks)).toEqual([]);
  });

  it("dedupes edges that collapse onto the same pair", () => {
    const blocks = [block("t1", "todo"), block("t2", "todo"), block("h", "header-1")];
    const next = anchorConnections([conn("t1", "h"), conn("t2", "h")], blocks);
    expect(next).toEqual([conn("t1", "h")]);
  });

  it("preserves edges and color when nothing remaps", () => {
    const blocks = [block("h", "header-1"), block("c", "code")];
    const edge = { from_id: "h", to_id: "c", color: "#ffb511" };
    expect(anchorConnections([edge], blocks)).toEqual([edge]);
  });
});
