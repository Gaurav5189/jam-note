import { describe, expect, it } from "vitest";

import type { WorkspaceTree } from "@/lib/types";
import {
  buildPickerList,
  filterPickerList,
  folderNotes,
  pickerNotePath,
} from "./export-picker";

// Workspace shape mirrors the concept's demo tree:
// WORKSPACE
//   ├─ HELLO/            (folder)
//   │   ├─ FIRST LOVE    (note)
//   │   └─ HERO/         (folder)
//   │       └─ JOKER     (note)
//   └─ 3 BODY PROBLEM    (root note)
function tree(): WorkspaceTree {
  return {
    folders: [
      {
        id: "f1",
        parent_folder_id: null,
        name: "HELLO",
        order: 0,
        color: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        folders: [
          {
            id: "f2",
            parent_folder_id: "f1",
            name: "HERO",
            order: 0,
            color: null,
            created_at: "2026-01-02T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
            folders: [],
            notes: [
              {
                id: "n2",
                folder_id: "f2",
                title: "JOKER",
                layout_type: "document",
                emoji_icon: null,
                color: null,
                is_published: false,
                is_pinned: false,
                read_only: false,
                created_at: "2026-01-03T00:00:00Z",
                updated_at: "2026-01-03T00:00:00Z",
              },
            ],
          },
        ],
        notes: [
          {
            id: "n1",
            folder_id: "f1",
            title: "FIRST LOVE",
            layout_type: "document",
            emoji_icon: null,
            color: null,
            is_published: false,
            is_pinned: false,
            read_only: false,
            created_at: "2026-01-02T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
          },
        ],
      },
    ],
    notes: [
      {
        id: "n3",
        folder_id: null,
        title: "3 BODY PROBLEM",
        layout_type: "document",
        emoji_icon: null,
        color: null,
        is_published: false,
        is_pinned: false,
        read_only: false,
        created_at: "2026-01-04T00:00:00Z",
        updated_at: "2026-01-04T00:00:00Z",
      },
    ],
  };
}

describe("buildPickerList", () => {
  it("lists folders first in creation order, then every note at any depth", () => {
    const entries = buildPickerList(tree());
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual([
      "folder:HELLO",
      "folder:HERO",
      "note:FIRST LOVE",
      "note:JOKER",
      "note:3 BODY PROBLEM",
    ]);
  });

  it("carries ancestor paths and recursive note counts", () => {
    const entries = buildPickerList(tree());
    const hero = entries.find((e) => e.name === "HERO") as {
      kind: "folder";
      path: string[];
      noteCount: number;
    };
    expect(hero.path).toEqual(["HELLO"]);
    expect(hero.noteCount).toBe(1);
    const joker = entries.find((e) => e.name === "JOKER") as {
      kind: "note";
      path: string[];
    };
    expect(joker.path).toEqual(["HELLO", "HERO"]);
  });
});

describe("filterPickerList", () => {
  it("matches names and paths case-insensitively", () => {
    const entries = buildPickerList(tree());
    expect(filterPickerList(entries, "jok").map((e) => e.name)).toEqual(["JOKER"]);
    expect(filterPickerList(entries, "hello").map((e) => e.name)).toEqual([
      "HELLO",
      "HERO",
      "FIRST LOVE",
      "JOKER",
    ]);
    expect(filterPickerList(entries, "body").map((e) => e.name)).toEqual([
      "3 BODY PROBLEM",
    ]);
  });

  it("returns everything for a blank query", () => {
    const entries = buildPickerList(tree());
    expect(filterPickerList(entries, "   ")).toHaveLength(entries.length);
  });
});

describe("folderNotes", () => {
  it("lists direct notes first, then nested ones with relative paths", () => {
    const notes = folderNotes(tree(), "f1");
    expect(notes).toEqual([
      { id: "n1", name: "FIRST LOVE", relPath: [] },
      { id: "n2", name: "JOKER", relPath: ["HERO"] },
    ]);
  });

  it("returns only the subfolder's notes for a nested folder", () => {
    expect(folderNotes(tree(), "f2")).toEqual([
      { id: "n2", name: "JOKER", relPath: [] },
    ]);
  });

  it("returns an empty list for unknown ids", () => {
    expect(folderNotes(tree(), "ghost")).toEqual([]);
  });
});

describe("pickerNotePath", () => {
  it("resolves root notes to an empty path", () => {
    expect(pickerNotePath(tree(), "n3")).toEqual([]);
  });

  it("resolves nested notes to their absolute ancestor chain", () => {
    expect(pickerNotePath(tree(), "n2")).toEqual(["HELLO", "HERO"]);
  });

  it("returns null for unknown ids", () => {
    expect(pickerNotePath(tree(), "ghost")).toBeNull();
  });
});
