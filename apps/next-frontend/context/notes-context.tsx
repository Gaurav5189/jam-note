"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { fetchApi } from "@/lib/api";
import {
  insertTreeItem,
  removeTreeItem,
  updateTreeItem,
  toTreeItem,
} from "@/lib/note-tree";
import type {
  Block,
  Note,
  NoteCreateInput,
  NoteTreeItem,
  NoteUpdateInput,
} from "@/lib/types";

interface NotesContextType {
  tree: NoteTreeItem[];
  /** True while a create/delete mutation is in flight. */
  mutating: boolean;
  /** Last mutation error, cleared on the next successful operation. */
  error: string | null;
  createNote: (input: NoteCreateInput) => Promise<Note>;
  updateNote: (id: string, input: NoteUpdateInput) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  refreshTree: () => Promise<void>;
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
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({
  initialTree,
  children,
}: {
  initialTree: NoteTreeItem[];
  children: React.ReactNode;
}) {
  // Seeded from the server-rendered tree so the sidebar paints instantly
  // with zero layout shift; mutations keep it in sync optimistically.
  const [tree, setTree] = useState<NoteTreeItem[]>(initialTree);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    const fresh = await fetchApi<NoteTreeItem[]>("/api/notes/trees");
    setTree(fresh);
  }, []);

  const createNote = useCallback(async (input: NoteCreateInput) => {
    setMutating(true);
    setError(null);
    try {
      const note = await fetchApi<Note>("/api/notes", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setTree((current) => insertTreeItem(current, toTreeItem(note)));
      return note;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
      throw err;
    } finally {
      setMutating(false);
    }
  }, []);

  const updateNote = useCallback(async (id: string, input: NoteUpdateInput) => {
    setMutating(true);
    setError(null);
    try {
      await fetchApi<Note>(`/api/notes/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
      setTree((current) => updateTreeItem(current, id, input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note");
      throw err;
    } finally {
      setMutating(false);
    }
  }, []);

  const renameNote = useCallback(
    async (id: string, title: string) => {
      await updateNote(id, { title });
    },
    [updateNote]
  );

  const deleteNote = useCallback(async (id: string) => {
    setMutating(true);
    setError(null);
    // Optimistic: mirror the backend cascade locally (children lift into
    // the deleted note's slot). On failure, refetch the authoritative tree.
    setTree((current) => removeTreeItem(current, id));
    try {
      await fetchApi(`/api/notes/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note");
      try {
        await refreshTree();
      } catch {
        // Keep the original mutation error.
      }
    } finally {
      setMutating(false);
    }
  }, [refreshTree]);

  const saveBlocks = useCallback(
    async (id: string, blocks: Block[], options?: { keepalive?: boolean }) => {
      const note = await fetchApi<Note>(`/api/notes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ blocks }),
        // Spread into fetch — keepalive lets unload flushes survive navigation.
        ...(options?.keepalive ? { keepalive: true } : {}),
      });
      // Keep the tree's updated_at fresh for the dashboard's recent list.
      setTree((current) => updateTreeItem(current, id, { updated_at: note.updated_at }));
    },
    []
  );

  return (
    <NotesContext.Provider
      value={{ tree, mutating, error, createNote, updateNote, renameNote, deleteNote, refreshTree, saveBlocks }}
    >
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error("useNotes must be used within a NotesProvider");
  }
  return context;
}
