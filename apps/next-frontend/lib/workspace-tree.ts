import type {
  Folder,
  FolderTreeItem,
  NoteListItem,
  WorkspaceTree,
} from "@/lib/types";

// Pure workspace-tree operations mirroring the backend's hierarchy
// semantics in fastapi_backend/folders/service.py, so optimistic sidebar
// updates stay in sync with what MongoDB actually stores. Notes are
// leaves; only folders contain things.

/** Apply fn to every folder in the list; returning null removes the
 * folder. The walk preserves untouched branch identity so React's
 * StrictMode double-invocation and memoized rows stay cheap. */
function mapFolderList(
  folders: FolderTreeItem[],
  fn: (folder: FolderTreeItem) => FolderTreeItem | null
): FolderTreeItem[] {
  let changed = false;
  const result: FolderTreeItem[] = [];
  for (const folder of folders) {
    const mapped = fn(folder);
    if (mapped === null) {
      changed = true;
      continue;
    }
    const newChildren = mapFolderList(mapped.folders, fn);
    if (newChildren !== mapped.folders) {
      changed = true;
      result.push({ ...mapped, folders: newChildren });
    } else {
      result.push(mapped);
    }
    if (mapped !== folder) changed = true;
  }
  return changed ? result : folders;
}

/** Note-list twin of mapFolderList. */
function mapNoteList(
  notes: NoteListItem[],
  fn: (note: NoteListItem) => NoteListItem | null
): NoteListItem[] {
  let changed = false;
  const result: NoteListItem[] = [];
  for (const note of notes) {
    const mapped = fn(note);
    if (mapped === null) {
      changed = true;
      continue;
    }
    result.push(mapped);
    if (mapped !== note) changed = true;
  }
  return changed ? result : notes;
}

function patchNotesIn(
  tree: WorkspaceTree,
  fn: (note: NoteListItem) => NoteListItem | null
): WorkspaceTree {
  const notes = mapNoteList(tree.notes, fn);
  const folders = mapFolderList(tree.folders, (folder) => {
    const newNotes = mapNoteList(folder.notes, fn);
    return newNotes !== folder.notes ? { ...folder, notes: newNotes } : folder;
  });
  return folders === tree.folders && notes === tree.notes
    ? tree
    : { folders, notes };
}

/** Find a note, its containing folder chain (root…parent), or null. */
export function findNotePath(
  tree: WorkspaceTree,
  noteId: string
): { folders: FolderTreeItem[]; note: NoteListItem } | null {
  for (const note of tree.notes) {
    if (note.id === noteId) return { folders: [], note };
  }
  for (const folder of tree.folders) {
    for (const note of folder.notes) {
      if (note.id === noteId) return { folders: [folder], note };
    }
    const deeper = findNotePath({ folders: folder.folders, notes: [] }, noteId);
    if (deeper) return { folders: [folder, ...deeper.folders], note: deeper.note };
  }
  return null;
}

/** Find a folder and its ancestor chain: [root, …, folder]. */
export function findFolderPath(
  tree: WorkspaceTree,
  folderId: string
): FolderTreeItem[] | null {
  for (const folder of tree.folders) {
    if (folder.id === folderId) return [folder];
    const deeper = findFolderPath({ folders: folder.folders, notes: [] }, folderId);
    if (deeper) return [folder, ...deeper];
  }
  return null;
}

/** Every note in the tree, root notes first then folder contents. */
export function flattenNotes(tree: WorkspaceTree): NoteListItem[] {
  const result: NoteListItem[] = [...tree.notes];
  const walk = (folders: FolderTreeItem[]) => {
    for (const folder of folders) {
      result.push(...folder.notes);
      walk(folder.folders);
    }
  };
  walk(tree.folders);
  return result;
}

/** Insert a freshly created note into its folder, or as a root. */
export function insertNote(
  tree: WorkspaceTree,
  note: NoteListItem
): WorkspaceTree {
  if (note.folder_id === null) return { ...tree, notes: [...tree.notes, note] };

  let found = false;
  const folders = mapFolderList(tree.folders, (folder) => {
    if (folder.id === note.folder_id) {
      found = true;
      return { ...folder, notes: [...folder.notes, note] };
    }
    return folder;
  });

  // Folder missing from the whole tree — surface the note as a root so
  // it stays visible (same guarantee as the backend's tree builder).
  // This fallback must consider the ENTIRE tree: firing it per-subtree
  // used to append the note to every leaf's children (the September
  // duplicate-row bug).
  return found ? { ...tree, folders } : { ...tree, notes: [...tree.notes, note] };
}

/** Insert a freshly created folder (as returned by POST /api/folders). */
export function insertFolder(tree: WorkspaceTree, folder: Folder): WorkspaceTree {
  const item: FolderTreeItem = { ...folder, folders: [], notes: [] };
  if (folder.parent_folder_id === null) {
    return { ...tree, folders: [...tree.folders, item] };
  }

  let found = false;
  const folders = mapFolderList(tree.folders, (parent) => {
    if (parent.id === folder.parent_folder_id) {
      found = true;
      return { ...parent, folders: [...parent.folders, item] };
    }
    return parent;
  });

  return found ? { ...tree, folders } : { ...tree, folders: [...tree.folders, item] };
}

/** Remove a note leaf from wherever it lives. */
export function removeNote(tree: WorkspaceTree, id: string): WorkspaceTree {
  return patchNotesIn(tree, (note) => (note.id === id ? null : note));
}

/** Remove a folder, lifting its notes + sub-folders into its own slot —
 * the optimistic twin of the backend's lift-before-delete. */
export function removeFolder(tree: WorkspaceTree, id: string): WorkspaceTree {
  const path = findFolderPath(tree, id);
  if (!path) return tree;
  const removed = path[path.length - 1];
  const parentFolderId = removed.parent_folder_id;
  // Lifted children re-point at the removed folder's parent.
  const liftedFolders = removed.folders.map((child) => ({
    ...child,
    parent_folder_id: parentFolderId,
  }));
  const liftedNotes = removed.notes.map((note) => ({
    ...note,
    folder_id: parentFolderId,
  }));

  const folders = mapFolderList(tree.folders, (folder) =>
    folder.id === id ? null : folder
  );

  if (parentFolderId === null) {
    return {
      folders: [...folders, ...liftedFolders],
      notes: [...tree.notes, ...liftedNotes],
    };
  }

  const spliced = mapFolderList(folders, (folder) =>
    folder.id === parentFolderId
      ? {
          ...folder,
          folders: [...folder.folders, ...liftedFolders],
          notes: [...folder.notes, ...liftedNotes],
        }
      : folder
  );
  return { ...tree, folders: spliced };
}

/** Patch a note leaf (title, updated_at, …) anywhere in the tree. */
export function updateNoteItem(
  tree: WorkspaceTree,
  id: string,
  patch: Partial<NoteListItem>
): WorkspaceTree {
  return patchNotesIn(tree, (note) =>
    note.id === id ? { ...note, ...patch } : note
  );
}

/** Patch a folder (name, updated_at, …) anywhere in the tree. */
export function updateFolderItem(
  tree: WorkspaceTree,
  id: string,
  patch: Partial<Folder>
): WorkspaceTree {
  const folders = mapFolderList(tree.folders, (folder) =>
    folder.id === id ? { ...folder, ...patch } : folder
  );
  return folders === tree.folders ? tree : { ...tree, folders };
}

/**
 * Move a note into a folder (null = the workspace root). No structural
 * change when the target is the note's current location or is missing
 * from the tree — the backend re-validates every move.
 */
export function moveNote(
  tree: WorkspaceTree,
  id: string,
  folderId: string | null
): WorkspaceTree {
  const path = findNotePath(tree, id);
  if (!path || path.note.folder_id === folderId) return tree;
  if (folderId !== null && !findFolderPath(tree, folderId)) return tree;

  const stripped = patchNotesIn(tree, (note) => (note.id === id ? null : note));
  return insertNote(stripped, { ...path.note, folder_id: folderId });
}

/**
 * Move a folder into another folder (null = the workspace root).
 * Returns null when the move is unlawful (into itself or into one of its
 * own descendants) or when the target is missing — callers surface the
 * rejection and keep the tree untouched.
 */
export function moveFolder(
  tree: WorkspaceTree,
  id: string,
  parentFolderId: string | null
): WorkspaceTree | null {
  if (parentFolderId !== null) {
    if (parentFolderId === id) return null;
    const targetPath = findFolderPath(tree, parentFolderId);
    if (!targetPath) return null;
    // The target's ancestor chain may not contain the moved folder.
    if (targetPath.some((folder) => folder.id === id)) return null;
  }

  const moved = findFolderPath(tree, id);
  if (!moved) return null;

  const item: FolderTreeItem = {
    ...moved[moved.length - 1],
    parent_folder_id: parentFolderId,
  };
  const folders = mapFolderList(tree.folders, (folder) =>
    folder.id === id ? null : folder
  );
  if (parentFolderId === null) {
    return { folders: [...folders, item], notes: tree.notes };
  }

  const spliced = mapFolderList(folders, (folder) =>
    folder.id === parentFolderId
      ? { ...folder, folders: [...folder.folders, item] }
      : folder
  );
  return { ...tree, folders: spliced };
}
