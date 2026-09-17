import { describe, expect, it } from "vitest";
import type { Block } from "../types";
import {
  SEED_BLOCK_ID,
  blockText,
  convertBlock,
  createBlock,
  createSeedBlock,
  getBlock,
  insertBlockAfter,
  insertPastedBlocks,
  isTextualBlock,
  mergeDrafts,
  mergeWithPrevious,
  removeBlock,
  reorderBlocks,
  setBlockText,
  splitBlock,
  updateBlockProperties,
} from "./blocks";

function block(id: string, text: string, type: string = "text", extra: object = {}): Block {
  return {
    id,
    type,
    properties: { text, ...extra },
    canvas_metadata: null,
  };
}

describe("createBlock / createSeedBlock", () => {
  it("creates a block with an id and empty text default", () => {
    const b = createBlock("text");
    expect(b.id).toBeTruthy();
    expect(b.type).toBe("text");
    expect(b.properties.text).toBe("");
    expect(b.canvas_metadata).toBeNull();
  });

  it("accepts initial properties", () => {
    const b = createBlock("todo", { text: "x", checked: true });
    expect(b.properties.checked).toBe(true);
    expect(b.properties.text).toBe("x");
  });

  it("creates unique ids", () => {
    expect(createBlock().id).not.toBe(createBlock().id);
  });

  it("seeds a deterministic id for hydration safety", () => {
    expect(createSeedBlock().id).toBe(SEED_BLOCK_ID);
    expect(blockText(createSeedBlock())).toBe("");
  });
});

describe("isTextualBlock", () => {
  it("classifies textual types", () => {
    for (const type of ["text", "header-1", "header-2", "header-3", "todo", "list-item", "code"]) {
      expect(isTextualBlock(type)).toBe(true);
    }
  });

  it("rejects embeds and foreign types", () => {
    for (const type of ["image", "drawing", "canvas-node", "custom-thing"]) {
      expect(isTextualBlock(type)).toBe(false);
    }
  });
});

describe("setBlockText", () => {
  const blocks = [block("a", "one"), block("b", "two")];

  it("updates only the target block and keeps sibling identity", () => {
    const next = setBlockText(blocks, "a", "ONE");
    expect(blockText(next[0])).toBe("ONE");
    expect(next[1]).toBe(blocks[1]);
  });

  it("returns the same array when the text is unchanged", () => {
    expect(setBlockText(blocks, "a", "one")).toBe(blocks);
  });

  it("returns the same array for unknown ids", () => {
    expect(setBlockText(blocks, "zzz", "x")).toBe(blocks);
  });
});

describe("mergeDrafts", () => {
  it("bakes drafts into the authoritative array", () => {
    const blocks = [block("a", "stale"), block("b", "same"), block("c", "old")];
    const drafts = new Map([
      ["a", "fresh"],
      ["c", "new"],
    ]);
    const next = mergeDrafts(blocks, drafts);
    expect(blockText(next[0])).toBe("fresh");
    expect(blockText(next[1])).toBe("same");
    expect(next[1]).toBe(blocks[1]);
    expect(blockText(next[2])).toBe("new");
  });

  it("ignores drafts for blocks that no longer exist", () => {
    const blocks = [block("a", "hello")];
    const next = mergeDrafts(blocks, new Map([["gone", "text"]]));
    expect(next).toBe(blocks);
  });
});

describe("updateBlockProperties", () => {
  it("shallow-merges the property patch", () => {
    const blocks = [block("a", "task", "todo", { checked: false })];
    const next = updateBlockProperties(blocks, "a", { checked: true });
    expect(getBlock(next, "a")?.properties.checked).toBe(true);
    expect(getBlock(next, "a")?.properties.text).toBe("task");
  });

  it("keeps other blocks untouched", () => {
    const blocks = [block("a", "x"), block("b", "y")];
    const next = updateBlockProperties(blocks, "b", { src: "https://example.com/i.png" });
    expect(next[0]).toBe(blocks[0]);
    expect(getBlock(next, "b")?.properties.src).toBe("https://example.com/i.png");
  });
});

describe("insertBlockAfter", () => {
  const blocks = [block("a", "1"), block("b", "2")];

  it("inserts below the anchor", () => {
    const inserted = createBlock("text");
    const next = insertBlockAfter(blocks, "a", inserted);
    expect(next.map((b) => b.id)).toEqual(["a", inserted.id, "b"]);
  });

  it("inserts at the top when the anchor is null", () => {
    const inserted = createBlock("text");
    const next = insertBlockAfter(blocks, null, inserted);
    expect(next[0].id).toBe(inserted.id);
  });

  it("returns the same array for unknown anchors", () => {
    const inserted = createBlock("text");
    expect(insertBlockAfter(blocks, "zzz", inserted)).toBe(blocks);
  });
});

describe("splitBlock", () => {
  it("splits a text block at the caret", () => {
    const blocks = [block("a", "hello world")];
    const { blocks: next, focus } = splitBlock(blocks, "a", 5);
    expect(blockText(next[0])).toBe("hello");
    expect(next[1].type).toBe("text");
    expect(blockText(next[1])).toBe(" world");
    expect(focus?.blockId).toBe(next[1].id);
    expect(focus?.caretOffset).toBe(0);
  });

  it("propagates todo type and resets checked", () => {
    const blocks = [block("a", "buy milk", "todo", { checked: true })];
    const { blocks: next } = splitBlock(blocks, "a", 5);
    expect(next[1].type).toBe("todo");
    expect(next[1].properties.checked).toBe(false);
    expect(blockText(next[1])).toBe("ilk");
  });

  it("propagates list-item type", () => {
    const blocks = [block("a", "- item", "list-item")];
    const { blocks: next } = splitBlock(blocks, "a", 2);
    expect(next[1].type).toBe("list-item");
  });

  it("downgrades the second half to text when splitting a header", () => {
    const blocks = [block("a", "Big title", "header-1")];
    const { blocks: next } = splitBlock(blocks, "a", 3);
    expect(next[0].type).toBe("header-1");
    expect(blockText(next[0])).toBe("Big");
    expect(next[1].type).toBe("text");
    expect(blockText(next[1])).toBe(" title");
  });

  it("clamps out-of-range carets", () => {
    const blocks = [block("a", "abc")];
    expect(blockText(splitBlock(blocks, "a", 99).blocks[1])).toBe("");
    expect(blockText(splitBlock(blocks, "a", -5).blocks[0])).toBe("");
  });

  it("keeps focus on a split at the very end", () => {
    const blocks = [block("a", "abc")];
    const { blocks: next, focus } = splitBlock(blocks, "a", 3);
    expect(blockText(next[0])).toBe("abc");
    expect(blockText(next[1])).toBe("");
    expect(focus?.blockId).toBe(next[1].id);
  });

  it("no-ops for unknown ids", () => {
    const blocks = [block("a", "abc")];
    expect(splitBlock(blocks, "zzz", 1)).toEqual({ blocks, focus: null });
  });
});

describe("mergeWithPrevious", () => {
  it("merges into the previous text block with the caret at the junction", () => {
    const blocks = [block("a", "one"), block("b", "two")];
    const { blocks: next, focus } = mergeWithPrevious(blocks, "b");
    expect(next.length).toBe(1);
    expect(blockText(next[0])).toBe("onetwo");
    expect(focus).toEqual({ blockId: "a", caretOffset: 3 });
  });

  it("joins with a newline when merging into a code block", () => {
    const blocks = [block("a", "print(1)", "code"), block("b", "print(2)")];
    const { blocks: next, focus } = mergeWithPrevious(blocks, "b");
    expect(blockText(next[0])).toBe("print(1)\nprint(2)");
    expect(focus?.caretOffset).toBe(9);
  });

  it("removes an embed instead of merging it", () => {
    const blocks = [block("a", "one"), block("img", "", "image", { src: "x.png" })];
    const { blocks: next, focus } = mergeWithPrevious(blocks, "img");
    expect(next.map((b) => b.id)).toEqual(["a"]);
    expect(focus).toEqual({ blockId: "a", caretOffset: "end" });
  });

  it("refuses to merge into an embed above", () => {
    const blocks = [block("img", "", "image", { src: "x.png" }), block("b", "text")];
    expect(mergeWithPrevious(blocks, "b")).toEqual({ blocks, focus: null });
  });

  it("no-ops on the first block", () => {
    const blocks = [block("a", "only")];
    expect(mergeWithPrevious(blocks, "a")).toEqual({ blocks, focus: null });
  });

  it("no-ops for unknown ids", () => {
    const blocks = [block("a", "x")];
    expect(mergeWithPrevious(blocks, "zzz")).toEqual({ blocks, focus: null });
  });
});

describe("removeBlock", () => {
  it("focuses the block above at its end", () => {
    const blocks = [block("a", "one"), block("b", "two"), block("c", "three")];
    const { blocks: next, focus } = removeBlock(blocks, "b");
    expect(next.map((b) => b.id)).toEqual(["a", "c"]);
    expect(focus).toEqual({ blockId: "a", caretOffset: "end" });
  });

  it("focuses the block below when removing the first", () => {
    const blocks = [block("a", "one"), block("b", "two")];
    const { blocks: next, focus } = removeBlock(blocks, "a");
    expect(next.map((b) => b.id)).toEqual(["b"]);
    expect(focus).toEqual({ blockId: "b", caretOffset: 0 });
  });

  it("returns a null focus when the document becomes empty", () => {
    const blocks = [block("a", "only")];
    const { blocks: next, focus } = removeBlock(blocks, "a");
    expect(next).toEqual([]);
    expect(focus).toBeNull();
  });

  it("no-ops for unknown ids", () => {
    const blocks = [block("a", "x")];
    expect(removeBlock(blocks, "zzz")).toEqual({ blocks, focus: null });
  });
});

describe("reorderBlocks", () => {
  const blocks = [block("a", "1"), block("b", "2"), block("c", "3")];

  it("moves a block down", () => {
    const next = reorderBlocks(blocks, 0, 2);
    expect(next.map((b) => b.id)).toEqual(["b", "c", "a"]);
  });

  it("moves a block up", () => {
    const next = reorderBlocks(blocks, 2, 0);
    expect(next.map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  it("returns the same array on no-ops and invalid indices", () => {
    expect(reorderBlocks(blocks, 1, 1)).toBe(blocks);
    expect(reorderBlocks(blocks, -1, 0)).toBe(blocks);
    expect(reorderBlocks(blocks, 0, 99)).toBe(blocks);
  });
});

describe("convertBlock", () => {
  it("converts type and applies the next text", () => {
    const blocks = [block("a", "hello")];
    const next = convertBlock(blocks, "a", "hello", "header-1");
    expect(next[0].type).toBe("header-1");
    expect(blockText(next[0])).toBe("hello");
  });

  it("defaults todos to unchecked", () => {
    const blocks = [block("a", "task")];
    const next = convertBlock(blocks, "a", "task", "todo");
    expect(next[0].properties.checked).toBe(false);
  });

  it("respects an explicit checked patch", () => {
    const blocks = [block("a", "done")];
    const next = convertBlock(blocks, "a", "done", "todo", { checked: true });
    expect(next[0].properties.checked).toBe(true);
  });

  it("clears checked when converting away from a todo", () => {
    const blocks = [block("a", "task", "todo", { checked: true })];
    const next = convertBlock(blocks, "a", "task", "text");
    expect(next[0].properties.checked).toBeUndefined();
  });

  it("clears language when converting away from code", () => {
    const blocks = [block("a", "print(1)", "code", { language: "python" })];
    const next = convertBlock(blocks, "a", "print(1)", "text");
    expect(next[0].properties.language).toBeUndefined();
  });

  it("keeps the language when converting to code", () => {
    const blocks = [block("a", "print(1)", "code", { language: "python" })];
    const next = convertBlock(blocks, "a", "print(1)", "code");
    expect(next[0].properties.language).toBe("python");
  });

  it("no-ops for unknown ids", () => {
    const blocks = [block("a", "x")];
    expect(convertBlock(blocks, "zzz", "y", "text")).toBe(blocks);
  });
});

describe("insertPastedBlocks", () => {
  it("replaces an empty seed block with the pasted blocks", () => {
    const blocks = [block("seed", "")];
    const { blocks: next, focus } = insertPastedBlocks(blocks, "seed", 0, [
      { type: "header-1", text: "Title" },
      { type: "list-item", text: "Item 1" },
    ]);
    expect(next.length).toBe(2);
    expect(next[0].type).toBe("header-1");
    expect(next[0].properties.text).toBe("Title");
    expect(next[1].type).toBe("list-item");
    expect(next[1].properties.text).toBe("Item 1");
    expect(focus?.blockId).toBe(next[1].id);
    expect(focus?.caretOffset).toBe("end");
  });

  it("inserts parsed blocks after non-empty block and preserves text after caret", () => {
    const blocks = [block("b1", "Hello World")];
    // Caret after "Hello " (index 6)
    const { blocks: next, focus } = insertPastedBlocks(blocks, "b1", 6, [
      { type: "header-2", text: "Subheading" },
      { type: "todo", text: "Task", properties: { checked: true } },
    ]);
    expect(next.length).toBe(4);
    expect(next[0].id).toBe("b1");
    expect(next[0].properties.text).toBe("Hello ");
    expect(next[1].type).toBe("header-2");
    expect(next[1].properties.text).toBe("Subheading");
    expect(next[2].type).toBe("todo");
    expect(next[2].properties.text).toBe("Task");
    expect(next[2].properties.checked).toBe(true);
    expect(next[3].type).toBe("text");
    expect(next[3].properties.text).toBe("World");
    expect(focus?.blockId).toBe(next[2].id);
  });

  it("returns unchanged blocks when parsed array is empty", () => {
    const blocks = [block("b1", "Content")];
    const { blocks: next, focus } = insertPastedBlocks(blocks, "b1", 0, []);
    expect(next).toBe(blocks);
    expect(focus).toBeNull();
  });
});
