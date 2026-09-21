import { describe, expect, it } from "vitest";
import type { NoteTreeItem } from "./types";
import { flattenTree, insertTreeItem } from "./note-tree";

// Mirror of the sidebar/dashboard tree shapes: root notes may hold
// nested children (Phase 2 hierarchy, notes-in-notes).

function item(
  id: string,
  parent_id: string | null,
  children: NoteTreeItem[] = []
): NoteTreeItem {
  return {
    id,
    parent_id,
    title: id,
    layout_type: "document",
    emoji_icon: null,
    is_published: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    children,
  };
}

/** Tree: A ─ B (leaf), C ─ D (leaf) — two roots, each with one leaf. */
function sampleTree(): NoteTreeItem[] {
  return [
    item("a", null, [item("b", "a")]),
    item("c", null, [item("d", "c")]),
  ];
}

function ids(nodes: NoteTreeItem[]): string[] {
  return flattenTree(nodes).map((n) => n.id);
}

describe("insertTreeItem", () => {
  it("appends a root note when parent_id is null", () => {
    const tree = insertTreeItem(sampleTree(), item("n", null));
    expect(ids(tree)).toEqual(["a", "b", "c", "d", "n"]);
  });

  it("inserts under the parent only", () => {
    const tree = insertTreeItem(sampleTree(), item("n", "a"));
    expect(ids(tree)).toEqual(["a", "b", "n", "c", "d"]);
    const rootA = tree[0];
    expect(rootA.children.map((c) => c.id)).toEqual(["b", "n"]);
    // The untouched root keeps its original children.
    expect(tree[1].children.map((c) => c.id)).toEqual(["d"]);
  });

  it("inserts under a nested parent, leaving other leaves alone", () => {
    const tree = insertTreeItem(sampleTree(), item("n", "d"));
    expect(ids(tree)).toEqual(["a", "b", "c", "d", "n"]);
  });

  it("never duplicates the note across unrelated leaves (regression)", () => {
    // The old per-subtree fallback appended the note to EVERY leaf's
    // children, so a nested create showed up all over the sidebar and
    // produced duplicate keys in the dashboard's flattened list.
    const tree = insertTreeItem(sampleTree(), item("n", "b"));
    const flat = flattenTree(tree);
    expect(flat.filter((n) => n.id === "n")).toHaveLength(1);
    // No unrelated leaf gained a child.
    const d = flattenTree(tree).find((n) => n.id === "d");
    expect(d?.children).toEqual([]);
  });

  it("appends at root when the parent is missing from the whole tree", () => {
    const tree = insertTreeItem(sampleTree(), item("orphan", "zzz"));
    expect(ids(tree)).toEqual(["a", "b", "c", "d", "orphan"]);
  });

  it("keeps every id unique after an insert", () => {
    const tree = insertTreeItem(sampleTree(), item("n", "c"));
    const flat = flattenTree(tree);
    expect(new Set(flat.map((n) => n.id)).size).toBe(flat.length);
  });
});
