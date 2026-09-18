"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { findNotePath } from "@/lib/note-tree";

export function NoteHeader({ noteId, title: initialTitle }: { noteId: string; title: string }) {
  const { tree, renameNote, deleteNote } = useNotes();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive the live title from the context tree (updates optimistically on rename
  // from sidebar, palette, or header), falling back to SSR initialTitle.
  const activeNode = useMemo(() => {
    const path = findNotePath(tree, noteId);
    return path ? path[path.length - 1] : null;
  }, [tree, noteId]);

  const title = activeNode?.title ?? initialTitle;

  useEffect(() => {
    return () => {
      if (deleteResetTimer.current) clearTimeout(deleteResetTimer.current);
    };
  }, []);

  const submitRename = (value: string) => {
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) return;
    renameNote(noteId, trimmed).catch((err) => {
      console.error("Rename failed:", err);
    });
  };

  const startDeleteConfirm = () => {
    setConfirmingDelete(true);
    deleteResetTimer.current = setTimeout(() => setConfirmingDelete(false), 2500);
  };

  const confirmDelete = async () => {
    if (deleteResetTimer.current) clearTimeout(deleteResetTimer.current);
    setConfirmingDelete(false);
    await deleteNote(noteId);
    router.push("/dashboard");
  };

  return (
    <div className="flex items-start justify-between gap-4">
      {editing ? (
        <input
          autoFocus
          defaultValue={title}
          onBlur={(e) => submitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 max-w-[75ch] bg-background-steel border border-accent-neon rounded-sm text-2xl text-text-primary font-medium px-2 py-1 focus:outline-none"
          aria-label="Note title"
        />
      ) : (
        <h1
          onClick={() => setEditing(true)}
          title="Click to rename"
          className="max-w-[75ch] text-2xl text-text-primary font-medium cursor-text px-2 -mx-2 py-1 rounded-sm hover:bg-background-panel transition-colors break-words"
        >
          {title}
        </h1>
      )}

      {confirmingDelete ? (
        <button
          onClick={confirmDelete}
          className="shrink-0 text-[10px] font-mono uppercase tracking-wider bg-accent-amber text-background-base px-3 py-2 rounded-sm"
        >
          Confirm delete?
        </button>
      ) : (
        <button
          onClick={startDeleteConfirm}
          className="shrink-0 text-text-muted hover:text-accent-amber border border-border-thin hover:border-accent-amber p-2 rounded-sm transition-colors"
          title="Delete note"
          aria-label="Delete note"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
