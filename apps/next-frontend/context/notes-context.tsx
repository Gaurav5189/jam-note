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

  return (
    <NotesContext.Provider
      value={{ tree, mutating, error, createNote, updateNote, renameNote, deleteNote, refreshTree }}
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
