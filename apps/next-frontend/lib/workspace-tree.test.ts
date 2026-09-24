import { describe, expect, it } from "vitest";
import type { FolderTreeItem, NoteListItem, WorkspaceTree } from "./types";
import {
  findFolderPath,
  findNotePath,
  flattenNotes,
  insertFolder,
  insertNote,
  moveFolder,
  moveNote,
  removeFolder,
  removeNote,
  updateFolderItem,
  updateNoteItem,
} from "./workspace-tree";

// Mirror of the sidebar workspace shapes: folders nest folders + notes;
// notes are leaves (Phase 6 folder split).

function note(id: string, folder_id: string | null): NoteListItem {
  return {
    id,
    folder_id,
    title: id,
    layout_type: "document",
    emoji_icon: null,
    color: null,
    is_published: false,
    is_pinned: false,
    read_only: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
}

function folder(
  id: string,
  parent_folder_id: string | null,
  children: FolderTreeItem[] = [],
  notes: NoteListItem[] = []
): FolderTreeItem {
  return {
    id,
    parent_folder_id,
    name: id,
    order: 0,
    color: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    folders: children,
    notes,
  };
}

/** Tree: A(f1 root, holds note n1 + sub F1B(f2)), note n0 at root. */
function sampleTree(): WorkspaceTree {
  return {
    folders: [
      folder("f1", null, [folder("f2", "f1")], [note("n1", "f1")]),
    ],
    notes: [note("n0", null)],
  };
}

function noteIds(tree: WorkspaceTree): string[] {
  return flattenNotes(tree).map((n) => n.id);
}

function folderIds(tree: WorkspaceTree): string[] {
  const walk = (folders: FolderTreeItem[]): string[] =>
    folders.flatMap((f) => [f.id, ...walk(f.folders)]);
  return walk(tree.folders);
}

describe("findNotePath / findFolderPath", () => {
  it("finds a root note with an empty folder chain", () => {
    const found = findNotePath(sampleTree(), "n0");
    expect(found?.note.id).toBe("n0");
    expect(found?.folders).toEqual([]);
  });

  it("finds a nested note with its ancestor folder chain", () => {
    const deep: WorkspaceTree = {
      folders: [folder("fa", null, [folder("fb", "fa", [], [note("nd", "fb")])])],
      notes: [],
    };
    const found = findNotePath(deep, "nd");
    expect(found?.folders.map((f) => f.id)).toEqual(["fa", "fb"]);
    expect(found?.note.id).toBe("nd");
  });

  it("returns null for unknown notes", () => {
    expect(findNotePath(sampleTree(), "zz")).toBeNull();
  });

  it("finds a folder's ancestor chain", () => {
    const found = findFolderPath(sampleTree(), "f2");
    expect(found?.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(findFolderPath(sampleTree(), "zz")).toBeNull();
  });
});

describe("insertNote", () => {
  it("appends a root note when folder_id is null", () => {
    const tree = insertNote(sampleTree(), note("nn", null));
    expect(tree.notes.map((n) => n.id)).toEqual(["n0", "nn"]);
  });

  it("inserts into the folder only", () => {
    const tree = insertNote(sampleTree(), note("nn", "f1"));
    expect(tree.folders[0].notes.map((n) => n.id)).toEqual(["n1", "nn"]);
    // The untouched root list keeps its identity + contents.
    expect(tree.notes.map((n) => n.id)).toEqual(["n0"]);
  });

  it("never duplicates the note when the folder is missing (whole-tree fallback)", () => {
    // The folder id is unknown — the note must surface exactly once at
    // the root, never per-subtree (the September duplicate-row bug).
    const tree = insertNote(sampleTree(), note("nn", "ghost"));
    const all = flattenNotes(tree);
    expect(all.filter((n) => n.id === "nn")).toHaveLength(1);
    expect(tree.notes.map((n) => n.id)).toContain("nn");
  });
});

describe("insertFolder", () => {
  it("appends a root folder", () => {
    const tree = insertFolder(sampleTree(), {
      id: "fx",
      parent_folder_id: null,
      name: "fx",
      order: 0,
      color: null,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    });
    expect(tree.folders.map((f) => f.id)).toEqual(["f1", "fx"]);
    expect(tree.folders[1].folders).toEqual([]);
    expect(tree.folders[1].notes).toEqual([]);
  });

  it("nests under the parent folder", () => {
    const tree = insertFolder(sampleTree(), {
      id: "fx",
      parent_folder_id: "f1",
      name: "fx",
      order: 0,
      color: null,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    });
    expect(tree.folders[0].folders.map((f) => f.id)).toEqual(["f2", "fx"]);
  });
});

describe("removeNote / removeFolder", () => {
  it("removes a root note", () => {
    const tree = removeNote(sampleTree(), "n0");
    expect(noteIds(tree)).toEqual(["n1"]);
  });

  it("removes a nested note", () => {
    const tree = removeNote(sampleTree(), "n1");
    expect(tree.folders[0].notes).toEqual([]);
    expect(noteIds(tree)).toEqual(["n0"]);
  });

  it("removeFolder lifts notes + sub-folders to the deleted folder's parent", () => {
    const tree = removeFolder(sampleTree(), "f1");
    expect(folderIds(tree)).toEqual(["f2"]);
    // f2 re-points at the root; n1's folder_id becomes root (null).
    expect(tree.folders[0].id).toBe("f2");
    expect(tree.folders[0].parent_folder_id).toBeNull();
    expect(tree.notes.map((n) => n.id)).toEqual(["n0", "n1"]);
    expect(tree.notes[1].folder_id).toBeNull();
  });

  it("removeFolder lifts into the grandparent folder", () => {
    const tree = removeFolder(sampleTree(), "f2");
    expect(folderIds(tree)).toEqual(["f1"]);
    expect(tree.folders[0].folders).toEqual([]);
  });

  it("removeFolder on an unknown id is a no-op preserving identity", () => {
    const tree = sampleTree();
    expect(removeFolder(tree, "zz")).toBe(tree);
  });
});

describe("updateNoteItem / updateFolderItem", () => {
  it("patches a note anywhere and preserves untouched branches", () => {
    const tree = sampleTree();
    const next = updateNoteItem(tree, "n1", { title: "Renamed" });
    expect(next.folders[0].notes[0].title).toBe("Renamed");
    expect(next.notes).toBe(tree.notes); // untouched branch keeps identity
  });

  it("patches a folder name", () => {
    const next = updateFolderItem(sampleTree(), "f1", { name: "Renamed" });
    expect(next.folders[0].name).toBe("Renamed");
  });
});

describe("moveNote", () => {
  it("moves a root note into a folder", () => {
    const tree = moveNote(sampleTree(), "n0", "f1");
    expect(tree.notes).toEqual([]);
    expect(tree.folders[0].notes.map((n) => n.id)).toEqual(["n1", "n0"]);
    expect(tree.folders[0].notes[1].folder_id).toBe("f1");
  });

  it("moves a folder note to the root", () => {
    const tree = moveNote(sampleTree(), "n1", null);
    expect(tree.folders[0].notes).toEqual([]);
    expect(tree.notes.map((n) => n.id)).toEqual(["n0", "n1"]);
    expect(tree.notes[1].folder_id).toBeNull();
  });

  it("is a no-op when the target equals the current folder", () => {
    const tree = sampleTree();
    expect(moveNote(tree, "n1", "f1")).toBe(tree);
  });

  it("is a no-op when the target folder is missing", () => {
    const tree = sampleTree();
    expect(moveNote(tree, "n0", "ghost")).toBe(tree);
  });
});

describe("moveFolder", () => {
  it("moves a folder to the root", () => {
    const tree = moveFolder(sampleTree(), "f2", null);
    if (!tree) throw new Error("expected the move to succeed");
    expect(tree.folders.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(tree.folders[0].folders).toEqual([]);
    expect(tree.folders[1].parent_folder_id).toBeNull();
  });

  it("moves a folder under another folder (subtree travels along)", () => {
    const deep: WorkspaceTree = {
      folders: [
        folder("fa", null, [folder("faa", "fa")]),
        folder("fb", null),
      ],
      notes: [],
    };
    const tree = moveFolder(deep, "faa", "fb");
    if (!tree) throw new Error("expected the move to succeed");
    expect(tree.folders[0].folders).toEqual([]);
    expect(tree.folders[1].folders.map((f) => f.id)).toEqual(["faa"]);
    expect(tree.folders[1].folders[0].parent_folder_id).toBe("fb");
  });

  it("rejects moving a folder into itself", () => {
    expect(moveFolder(sampleTree(), "f1", "f1")).toBeNull();
  });

  it("rejects moving a folder into its own descendant (cycle guard)", () => {
    expect(moveFolder(sampleTree(), "f1", "f2")).toBeNull();
  });

  it("rejects a missing target folder", () => {
    expect(moveFolder(sampleTree(), "f1", "ghost")).toBeNull();
  });
});

describe("flattenNotes", () => {
  it("collects every note, root first then folder contents", () => {
    expect(noteIds(sampleTree())).toEqual(["n0", "n1"]);
  });
});
