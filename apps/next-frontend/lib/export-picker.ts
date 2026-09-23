import type { WorkspaceTree } from "@/lib/types";

/**
 * Pure helpers for the Profile export modal (make/dashboard_profile
 * design.md §5). The picker renders from the LIVE workspace tree —
 * folders first, created_at order; the confirm state shows contained
 * notes and both format choices carry small descriptions.
 */

export interface PickerFolderEntry {
  kind: "folder";
  id: string;
  name: string;
  /** Ancestor folder names from the workspace root. */
  path: string[];
  /** Every note at any depth inside (for the confirm head meta). */
  noteCount: number;
  createdAt: string;
}

export interface PickerNoteEntry {
  kind: "note";
  id: string;
  name: string;
  path: string[];
  createdAt: string;
}

export type PickerEntry = PickerFolderEntry | PickerNoteEntry;

function folderPathNames(tree: WorkspaceTree, folderId: string): string[] {
  const byId = new Map<string, { id: string; name: string; parent: string | null }>();
  const walk = (nodes: WorkspaceTree["folders"], parent: string | null) => {
    for (const node of nodes) {
      byId.set(node.id, { id: node.id, name: node.name, parent });
      walk(node.folders, node.id);
    }
  };
  walk(tree.folders, null);

  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return names;
}

function countFolderNotes(folders: WorkspaceTree["folders"]): number {
  let total = 0;
  for (const folder of folders) {
    total += folder.notes.length + countFolderNotes(folder.folders);
  }
  return total;
}

/** Folders first (created_at order), then every note at any depth. */
export function buildPickerList(tree: WorkspaceTree): PickerEntry[] {
  const folders: PickerFolderEntry[] = [];
  const notes: PickerNoteEntry[] = [];
  const walk = (nodes: WorkspaceTree["folders"], ancestors: string[]) => {
    for (const node of nodes) {
      folders.push({
        kind: "folder",
        id: node.id,
        name: node.name,
        path: ancestors,
        noteCount: countFolderNotes(node.folders) + node.notes.length,
        createdAt: node.created_at,
      });
      for (const note of node.notes) {
        notes.push({
          kind: "note",
          id: note.id,
          name: note.title,
          path: [...ancestors, node.name],
          createdAt: note.created_at,
        });
      }
      walk(node.folders, [...ancestors, node.name]);
    }
  };
  walk(tree.folders, []);

  for (const note of tree.notes) {
    notes.push({
      kind: "note",
      id: note.id,
      name: note.title,
      path: [],
      createdAt: note.created_at,
    });
  }

  folders.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  notes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return [...folders, ...notes];
}

/** Case-insensitive match on name or the workspace path. */
export function filterPickerList(entries: PickerEntry[], query: string): PickerEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(q) ||
      entry.path.some((segment) => segment.toLowerCase().includes(q)) ||
      entry.path.join(" / ").toLowerCase().includes(q)
  );
}

export interface ContainedNote {
  id: string;
  name: string;
  /** Path relative to the selected folder (folder itself excluded). */
  relPath: string[];
}

/** Every note inside a folder at any depth (the confirm list) — the
 *  folder's own direct notes first, then descendants. */
export function folderNotes(tree: WorkspaceTree, folderId: string): ContainedNote[] {
  const findNode = (
    nodes: WorkspaceTree["folders"]
  ): WorkspaceTree["folders"][number] | null => {
    for (const node of nodes) {
      if (node.id === folderId) return node;
      const nested = findNode(node.folders);
      if (nested) return nested;
    }
    return null;
  };

  const root = findNode(tree.folders);
  if (!root) return [];

  const notes: ContainedNote[] = [];
  const walk = (node: WorkspaceTree["folders"][number], relPath: string[]) => {
    for (const note of node.notes) {
      notes.push({ id: note.id, name: note.title, relPath });
    }
    for (const child of node.folders) {
      walk(child, [...relPath, child.name]);
    }
  };
  walk(root, []);
  return notes;
}

/** Absolute ancestor names of a note (used for the note confirm meta). */
export function pickerNotePath(tree: WorkspaceTree, noteId: string): string[] | null {
  for (const rootNote of tree.notes) {
    if (rootNote.id === noteId) return [];
  }
  const findFolderOfNote = (
    nodes: WorkspaceTree["folders"]
  ): string[] | null => {
    for (const node of nodes) {
      if (node.notes.some((n) => n.id === noteId)) {
        return folderPathNames(tree, node.id);
      }
      const nested = findFolderOfNote(node.folders);
      if (nested) return nested;
    }
    return null;
  };
  return findFolderOfNote(tree.folders);
}
