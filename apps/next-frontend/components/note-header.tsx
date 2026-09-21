"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import { findNotePath } from "@/lib/workspace-tree";
import { deskBurst, deskToast } from "@/components/desk/desk-chrome";

/**
 * Live title from the context tree (updates optimistically on rename from
 * sidebar, palette, or header), falling back to the SSR initial title.
 */
function useLiveTitle(noteId: string, initialTitle: string): string {
  const { tree } = useWorkspace();
  const activeNode = useMemo(() => {
    const path = findNotePath(tree, noteId);
    return path ? path.note : null;
  }, [tree, noteId]);
  return activeNode?.title ?? initialTitle;
}

/**
 * Inline note title for the glass command bar — 15px, single line, with an
 * edit-pencil affordance. Click the title (or the pencil) to rename.
 */
export function NoteTitleEditor({ noteId, title: initialTitle }: { noteId: string; title: string }) {
    const renameNote = useWorkspace().renameNote;
  const [editing, setEditing] = useState(false);
  const title = useLiveTitle(noteId, initialTitle);

  const submitRename = (value: string) => {
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) return;
    renameNote(noteId, trimmed).catch((err) => {
      console.error("Rename failed:", err);
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={title}
        onBlur={(e) => submitRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitRename(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }}
        className="nb-title-input"
        aria-label="Note title"
      />
    );
  }

  return (
    <h1 className="nb-title" onClick={() => setEditing(true)} title="Click to rename">
      <span>{title}</span>
      <Pencil size={11} aria-hidden="true" />
    </h1>
  );
}

/**
 * Two-step shred button for the glass command bar — first click arms the
 * red confirm chip (auto-resets after 2.5s), second click deletes.
 */
export function NoteDeleteButton({ noteId }: { noteId: string }) {
  const { deleteNote } = useWorkspace();
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (deleteResetTimer.current) clearTimeout(deleteResetTimer.current);
    };
  }, []);

  const startDeleteConfirm = () => {
    setConfirmingDelete(true);
    deleteResetTimer.current = setTimeout(() => setConfirmingDelete(false), 2500);
  };

  const confirmDelete = async () => {
    if (deleteResetTimer.current) clearTimeout(deleteResetTimer.current);
    setConfirmingDelete(false);
    await deleteNote(noteId);
    deskBurst(innerWidth / 2, innerHeight / 2, "#ff3d1c");
    deskToast("NOTE SHREDDED — GONE.");
    router.push("/dashboard");
  };

  if (confirmingDelete) {
    return (
      <button onClick={confirmDelete} className="del-chip-head" type="button">
        CONFIRM SHRED?
      </button>
    );
  }

  return (
    <button
      onClick={startDeleteConfirm}
      className="del-btn"
      title="Delete note"
      aria-label="Delete note"
      type="button"
    >
      <Trash2 size={13} />
    </button>
  );
}
