"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { findNotePath, flattenTree } from "@/lib/note-tree";
import type { NoteTreeItem } from "@/lib/types";

const RECENT_LIMIT = 8;

// Deterministic UTC stamp (avoids server/client hydration drift of
// relative-time formatters) — fits the tactile-terminal aesthetic.
function formatStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function RecentNotes() {
  const { tree, createNote } = useNotes();
  const router = useRouter();

  const notes = flattenTree(tree)
    .slice()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, RECENT_LIMIT);

  const handleCreate = async () => {
    try {
      const note = await createNote({ title: "Untitled" });
      router.push(`/notes/${note.id}`);
    } catch (err) {
      console.error("Note creation failed:", err);
    }
  };

  if (notes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-background-panel border border-border-thin rounded-md p-10 text-center">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2">
            Empty workspace
          </p>
          <h2 className="text-xl text-text-primary font-medium mb-6">
            No notes detected on this channel.
          </h2>
          <button
            onClick={handleCreate}
            className="bg-accent-neon text-background-base font-bold text-sm py-2.5 px-6 rounded-sm hover:opacity-90 transition-opacity uppercase tracking-wide"
          >
            New Note
          </button>
          <p className="mt-4 text-[11px] font-mono text-text-muted">
            or press <kbd className="border border-border-thin rounded-sm px-1.5 py-0.5">⌘K</kbd> to search
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-text-muted">
          Recent transmissions
        </h2>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-text-muted hover:text-accent-neon border border-border-thin hover:border-accent-neon px-3 py-1.5 rounded-sm transition-colors"
        >
          <Plus size={13} />
          New
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {notes.map((note) => (
          <RecentNoteCard key={note.id} note={note} tree={tree} />
        ))}
      </div>
    </div>
  );
}

function RecentNoteCard({ note, tree }: { note: NoteTreeItem; tree: NoteTreeItem[] }) {
  const path = findNotePath(tree, note.id);
  const parentPath =
    path && path.length > 1
      ? path.slice(0, -1).map((node) => node.title).join(" › ")
      : null;

  return (
    <Link
      href={`/notes/${note.id}`}
      prefetch={true}
      className="block bg-background-panel border border-border-thin rounded-sm p-4 hover:border-accent-neon/60 transition-colors"
    >
      <div className="flex items-start gap-2.5">
        {note.emoji_icon ? (
          <span className="text-base shrink-0">{note.emoji_icon}</span>
        ) : (
          <FileText size={15} className="text-text-muted shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary font-medium truncate">{note.title}</p>
          {parentPath && (
            <p className="text-[10px] font-mono text-text-muted truncate mt-0.5">{parentPath}</p>
          )}
          <p className="text-[10px] font-mono text-text-muted mt-2">
            {formatStamp(note.updated_at)}
            {note.layout_type === "canvas" && (
              <span className="ml-2 text-accent-amber uppercase">canvas</span>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}
