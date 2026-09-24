"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import { findNotePath } from "@/lib/workspace-tree";

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
export function NoteTitleEditor({
  noteId,
  title: initialTitle,
  readOnly = false,
}: {
  noteId: string;
  title: string;
  /** Read-only notes keep the title static (backend rejects renames). */
  readOnly?: boolean;
}) {
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
    <h1
      className="nb-title"
      onClick={() => {
        if (!readOnly) setEditing(true);
      }}
      title={readOnly ? "Read-only note" : "Click to rename"}
    >
      <span>{title}</span>
      {!readOnly && <Pencil size={11} aria-hidden="true" />}
    </h1>
  );
}
