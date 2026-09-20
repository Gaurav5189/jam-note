"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { findNotePath } from "@/lib/note-tree";
import { deskBurst, deskToast } from "@/components/desk/desk-chrome";

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
    deskBurst(innerWidth / 2, innerHeight / 2, "#ff3d1c");
    deskToast("NOTE SHREDDED — GONE.");
    router.push("/dashboard");
  };

  return (
    <>
      <p className="kicker rv" style={{ ["--rd" as string]: ".05s" }}>NOTE — OPEN</p>

      <div className="note-top-row rv" style={{ ["--rd" as string]: ".14s" }}>
        {editing ? (
          <input
            autoFocus
            defaultValue={title}
            onBlur={(e) => submitRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename(e.currentTarget.value);
              if (e.key === "Escape") setEditing(false);
            }}
            className="note-title"
            aria-label="Note title"
          />
        ) : (
          <h1
            onClick={() => setEditing(true)}
            title="Click to rename"
            className="note-title"
          >
            {title}
          </h1>
        )}

        {confirmingDelete ? (
          <button onClick={confirmDelete} className="del-chip-head" type="button">
            CONFIRM SHRED?
          </button>
        ) : (
          <button
            onClick={startDeleteConfirm}
            className="del-btn"
            title="Delete note"
            aria-label="Delete note"
            type="button"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="title-rule" aria-hidden="true" />
    </>
  );
}
