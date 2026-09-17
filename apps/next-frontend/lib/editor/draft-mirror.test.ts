import { beforeEach, describe, expect, it } from "vitest";
import type { Block } from "@/lib/types";
import { blocksEqual, clearMirror, readMirror, writeMirror } from "./draft-mirror";

// Minimal localStorage shim — the node test environment has none.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

function block(id: string, text: string): Block {
  return { id, type: "text", properties: { text }, canvas_metadata: null };
}

beforeEach(() => {
  store.clear();
});

describe("draft mirror round-trip", () => {
  it("writes and reads back the blocks", () => {
    const blocks = [block("a", "unsaved text"), block("b", "more")];
    writeMirror("note-1", blocks);
    expect(readMirror("note-1")).toEqual(blocks);
  });

  it("returns null when no mirror exists", () => {
    expect(readMirror("note-1")).toBeNull();
  });

  it("returns null on corrupt JSON instead of throwing", () => {
    store.set("jamnote:draft:note-1", "{not json");
    expect(readMirror("note-1")).toBeNull();
  });

  it("filters out entries that do not look like blocks", () => {
    store.set("jamnote:draft:note-1", JSON.stringify(["junk", block("a", "ok")]));
    const read = readMirror("note-1");
    expect(read).toHaveLength(1);
    expect(read?.[0].id).toBe("a");
  });

  it("keeps mirrors of different notes independent", () => {
    writeMirror("note-1", [block("a", "one")]);
    writeMirror("note-2", [block("b", "two")]);
    expect(readMirror("note-1")?.[0].properties.text).toBe("one");
    expect(readMirror("note-2")?.[0].properties.text).toBe("two");
  });

  it("clearMirror removes the stored draft", () => {
    writeMirror("note-1", [block("a", "gone")]);
    clearMirror("note-1");
    expect(readMirror("note-1")).toBeNull();
  });

  it("clearMirror is safe on a note that was never mirrored", () => {
    expect(() => clearMirror("note-404")).not.toThrow();
  });
});

describe("blocksEqual", () => {
  it("matches identical block lists", () => {
    const a = [block("a", "same"), block("b", "x")];
    expect(blocksEqual(a, [block("a", "same"), block("b", "x")])).toBe(true);
  });

  it("detects text differences", () => {
    expect(blocksEqual([block("a", "one")], [block("a", "two")])).toBe(false);
  });

  it("detects id and type differences", () => {
    expect(blocksEqual([block("a", "t")], [block("b", "t")])).toBe(false);
    const heading: Block = { id: "a", type: "header-1", properties: { text: "t" }, canvas_metadata: null };
    expect(blocksEqual([block("a", "t")], [heading])).toBe(false);
  });

  it("detects property differences (checked, src)", () => {
    const todoOff: Block = { id: "a", type: "todo", properties: { text: "t", checked: false }, canvas_metadata: null };
    const todoOn: Block = { id: "a", type: "todo", properties: { text: "t", checked: true }, canvas_metadata: null };
    expect(blocksEqual([todoOff], [todoOn])).toBe(false);

    const withSrc: Block = { id: "a", type: "image", properties: { text: "", src: "http://x/y.png" }, canvas_metadata: null };
    const noSrc: Block = { id: "a", type: "image", properties: { text: "" }, canvas_metadata: null };
    expect(blocksEqual([withSrc], [noSrc])).toBe(false);
  });

  it("ignores property key ordering", () => {
    const one = [{ ...block("a", "t"), properties: { text: "t", checked: false } }] as Block[];
    const two = [{ ...block("a", "t"), properties: { checked: false, text: "t" } }] as Block[];
    expect(blocksEqual(one, two)).toBe(true);
  });

  it("detects length differences", () => {
    expect(blocksEqual([block("a", "t")], [block("a", "t"), block("b", "")])).toBe(false);
  });
});
