"use client";

import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import { fetchApi } from "@/lib/api";
import {
  insertFolder,
  insertNote,
  moveFolder as moveFolderTree,
  moveNote as moveNoteInTree,
  removeFolder,
  removeNote,
  updateFolderItem,
  updateNoteItem,
} from "@/lib/workspace-tree";
import type {
  Block,
  BlockConnection,
  Folder,
  FolderCreateInput,
  LayoutType,
  Note,
  NoteCreateInput,
  NoteUpdateInput,
  WorkspaceTree,
} from "@/lib/types";

interface WorkspaceContextType {
  tree: WorkspaceTree;
  /** True while a create/delete/move mutation is in flight. */
  mutating: boolean;
  /** Last mutation error, cleared on the next successful operation. */
  error: string | null;
  refreshWorkspace: () => Promise<void>;
  // --- notes (leaves) ---
  createNote: (input: NoteCreateInput) => Promise<Note>;
  updateNote: (id: string, input: NoteUpdateInput) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  /** Move a note into a folder (null = workspace root). */
  moveNote: (id: string, folderId: string | null) => Promise<void>;
  /** Delete a note. Empty notes are shredded immediately server-side
   *  (they skip the trash) — the result says which happened. */
  deleteNote: (id: string) => Promise<{ purged: boolean }>;
  /**
   * Quiet blocks-only save for the editor's autosave. Deliberately bypasses
   * `mutating`/`error` so keystroke-driven saves never churn the sidebar —
   * the editor surfaces its own save state (Saving…/Saved/Sync error).
   */
  saveBlocks: (
    id: string,
    blocks: Block[],
    options?: { keepalive?: boolean }
  ) => Promise<void>;
  /**
   * Quiet canvas-level save for canvas positions, dimensions, and block connections.
   */
  saveCanvas: (
    id: string,
    payload: {
      blocks?: Block[];
      block_connections?: BlockConnection[];
      layout_type?: LayoutType;
    },
    options?: { keepalive?: boolean }
  ) => Promise<void>;
  // --- folders (pure containers) ---
  createFolder: (input: FolderCreateInput) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  /** Move a folder into another folder (null = workspace root). */
  moveFolder: (id: string, parentFolderId: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  /** Set/clear a folder's sidebar accent (palette key, null = clear). */
  setFolderColor: (id: string, color: string | null) => Promise<void>;
  /** Set/clear a note's own accent (palette key, null = clear inheritance). */
  setNoteColor: (id: string, color: string | null) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({
  initialTree,
  children,
}: {
  initialTree: WorkspaceTree;
  children: React.ReactNode;
}) {
  // Seeded from the server-rendered workspace so the sidebar paints
  // instantly with zero layout shift; mutations keep it in sync optimistically.
  const [tree, setTree] = useState<WorkspaceTree>(initialTree);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authoritative mirror of `tree` for mutation callbacks. Change
  // detection happens against the latest committed tree OUTSIDE the
  // state updater: updaters must stay pure (StrictMode double-invokes
  // them, so side effects like `changed` flags or setError inside an
  // updater are unreliable), and computing from the ref means rapid
  // sequential mutations compose on the freshest tree instead of a
  // stale closure. Every tree write goes through applyTree, keeping
  // ref and state in lockstep.
  const treeRef = useRef<WorkspaceTree>(initialTree);

  const applyTree = useCallback((next: WorkspaceTree) => {
    treeRef.current = next;
    setTree(next);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const fresh = await fetchApi<WorkspaceTree>("/api/workspace");
    applyTree(fresh);
  }, [applyTree]);

  // --- notes ---

  const createNote = useCallback(async (input: NoteCreateInput) => {
    setMutating(true);
    setError(null);
    try {
      const note = await fetchApi<Note>("/api/notes", {
        method: "POST",
        body: JSON.stringify(input),
      });
      applyTree(insertNote(treeRef.current, note));
      return note;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
      throw err;
    } finally {
      setMutating(false);
    }
  }, [applyTree]);

  const updateNote = useCallback(async (id: string, input: NoteUpdateInput) => {
    setMutating(true);
    setError(null);
    try {
      const note = await fetchApi<Note>(`/api/notes/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
      applyTree(
        updateNoteItem(treeRef.current, id, {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.layout_type !== undefined
            ? { layout_type: input.layout_type }
            : {}),
          ...(input.emoji_icon !== undefined ? { emoji_icon: input.emoji_icon } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          updated_at: note.updated_at,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note");
      throw err;
    } finally {
      setMutating(false);
    }
  }, [applyTree]);

  const renameNote = useCallback(
    async (id: string, title: string) => {
      await updateNote(id, { title });
    },
    [updateNote]
  );

  const moveNote = useCallback(
    async (id: string, folderId: string | null) => {
      // Optimistic move computed from the latest committed tree; on
      // failure refetch the authoritative tree.
      const current = treeRef.current;
      const next = moveNoteInTree(current, id, folderId);
      if (next === current) return;
      applyTree(next);
      setMutating(true);
      setError(null);
      try {
        await fetchApi<Note>(`/api/notes/${id}`, {
          method: "PUT",
          body: JSON.stringify({ folder_id: folderId }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move note");
        try {
          await refreshWorkspace();
        } catch {
          // Keep the original mutation error.
        }
      } finally {
        setMutating(false);
      }
    },
    [applyTree, refreshWorkspace]
  );

  const deleteNote = useCallback(
    async (id: string): Promise<{ purged: boolean }> => {
      setMutating(true);
      setError(null);
      // Optimistic: notes are leaves — nothing lifts. On failure,
      // refetch the authoritative tree.
      applyTree(removeNote(treeRef.current, id));
      try {
        const result = await fetchApi<{ purged?: boolean }>(
          `/api/notes/${id}`,
          { method: "DELETE" }
        );
        return { purged: result.purged === true };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete note");
        try {
          await refreshWorkspace();
        } catch {
          // Keep the original mutation error.
        }
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [applyTree, refreshWorkspace]
  );

  const saveBlocks = useCallback(
    async (id: string, blocks: Block[], options?: { keepalive?: boolean }) => {
      const note = await fetchApi<Note>(
        `/api/notes/${id}`,
        {
          method: "PUT",
          body: JSON.stringify({ blocks }),
          // Spread into fetch — keepalive lets unload flushes survive navigation.
          ...(options?.keepalive ? { keepalive: true } : {}),
        },
        // Quiet background save — the editor's save chip tracks it;
        // the top loading bar stays for explicit button presses only.
        false
      );
      // Keep the tree's updated_at fresh for the dashboard's recent list.
      applyTree(
        updateNoteItem(treeRef.current, id, { updated_at: note.updated_at })
      );
    },
    [applyTree]
  );

  const saveCanvas = useCallback(
    async (
      id: string,
      payload: {
        blocks?: Block[];
        block_connections?: BlockConnection[];
        layout_type?: LayoutType;
      },
      options?: { keepalive?: boolean }
    ) => {
      const note = await fetchApi<Note>(
        `/api/notes/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...(options?.keepalive ? { keepalive: true } : {}),
        },
        // Quiet background save — the editor's save chip tracks it;
        // the top loading bar stays for explicit button presses only.
        false
      );
      applyTree(
        updateNoteItem(treeRef.current, id, {
          updated_at: note.updated_at,
          ...(payload.layout_type ? { layout_type: payload.layout_type } : {}),
        })
      );
    },
    [applyTree]
  );

  // --- folders ---

  const createFolder = useCallback(async (input: FolderCreateInput) => {
    setMutating(true);
    setError(null);
    try {
      const folder = await fetchApi<Folder>("/api/folders", {
        method: "POST",
        body: JSON.stringify(input),
      });
      applyTree(insertFolder(treeRef.current, folder));
      return folder;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
      throw err;
    } finally {
      setMutating(false);
    }
  }, [applyTree]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    setMutating(true);
    setError(null);
    try {
      const folder = await fetchApi<Folder>(`/api/folders/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      applyTree(
        updateFolderItem(treeRef.current, id, {
          name: folder.name,
          updated_at: folder.updated_at,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename folder");
      throw err;
    } finally {
      setMutating(false);
    }
  }, [applyTree]);

  const moveFolder = useCallback(
    async (id: string, parentFolderId: string | null) => {
      // The helper rejects unlawful moves (into itself or a descendant)
      // before any request fires — surfaced as the error banner,
      // mirroring the backend's cycle rejection. Change detection runs
      // against the tree mirror so the state updater stays pure.
      const current = treeRef.current;
      const next = moveFolderTree(current, id, parentFolderId);
      if (next === null) {
        setError("Folder cycle — a folder can't move into its own contents.");
        return;
      }
      if (next === current) return;
      applyTree(next);
      setMutating(true);
      setError(null);
      try {
        await fetchApi<Folder>(`/api/folders/${id}`, {
          method: "PUT",
          body: JSON.stringify({ parent_folder_id: parentFolderId }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move folder");
        try {
          await refreshWorkspace();
        } catch {
          // Keep the original mutation error.
        }
      } finally {
        setMutating(false);
      }
    },
    [applyTree, refreshWorkspace]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      setMutating(true);
      setError(null);
      // Optimistic: mirror the backend lift locally (contents rise to
      // the deleted folder's parent). On failure, refetch.
      applyTree(removeFolder(treeRef.current, id));
      try {
        await fetchApi(`/api/folders/${id}`, { method: "DELETE" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete folder");
        try {
          await refreshWorkspace();
        } catch {
          // Keep the original mutation error.
        }
      } finally {
        setMutating(false);
      }
    },
    [applyTree, refreshWorkspace]
  );

  const setFolderColor = useCallback(
    async (id: string, color: string | null) => {
      // Optimistic tint; on failure refetch the authoritative tree.
      const current = treeRef.current;
      const next = updateFolderItem(current, id, { color });
      if (next === current) return;
      applyTree(next);
      setMutating(true);
      setError(null);
      try {
        await fetchApi<Folder>(`/api/folders/${id}`, {
          method: "PUT",
          body: JSON.stringify({ color }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set folder color");
        try {
          await refreshWorkspace();
        } catch {
          // Keep the original mutation error.
        }
      } finally {
        setMutating(false);
      }
    },
    [applyTree, refreshWorkspace]
  );

  const setNoteColor = useCallback(
    async (id: string, color: string | null) => {
      const current = treeRef.current;
      const next = updateNoteItem(current, id, { color });
      if (next === current) return;
      applyTree(next);
      setMutating(true);
      setError(null);
      try {
        await fetchApi<Note>(`/api/notes/${id}`, {
          method: "PUT",
          body: JSON.stringify({ color }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set note color");
        try {
          await refreshWorkspace();
        } catch {
          // Keep the original mutation error.
        }
      } finally {
        setMutating(false);
      }
    },
    [applyTree, refreshWorkspace]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        tree,
        mutating,
        error,
        refreshWorkspace,
        createNote,
        updateNote,
        renameNote,
        moveNote,
        deleteNote,
        saveBlocks,
        saveCanvas,
        createFolder,
        renameFolder,
        moveFolder,
        deleteFolder,
        setFolderColor,
        setNoteColor,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
