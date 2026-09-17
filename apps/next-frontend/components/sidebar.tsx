"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { findNotePath } from "@/lib/note-tree";
import type { NoteTreeItem } from "@/lib/types";

const NOTE_URL_PREFIX = "/notes/";

export function Sidebar() {
  const { tree, createNote, deleteNote, renameNote, error } = useNotes();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const router = useRouter();

  const activeNoteId = pathname.startsWith(NOTE_URL_PREFIX)
    ? pathname.slice(NOTE_URL_PREFIX.length)
    : null;

  // Auto-expand the ancestors of the active note so it is always visible
  // in the tree, even when reached via search. This is the React-documented
  // render-time state adjustment keyed on the active id — manual collapses
  // between navigations are preserved.
  const [prevActiveNoteId, setPrevActiveNoteId] = useState<string | null>(activeNoteId);
  if (activeNoteId !== prevActiveNoteId) {
    setPrevActiveNoteId(activeNoteId);
    const path = activeNoteId ? findNotePath(tree, activeNoteId) : null;
    if (path) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const node of path) {
          if (next.delete(node.id)) changed = true;
        }
        return changed ? next : prev;
      });
    }
  }

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreate = async (parentId: string | null) => {
    try {
      const note = await createNote({ title: "Untitled", parent_id: parentId });
      if (parentId !== null) {
        // Reveal the freshly created child inside its parent.
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      router.push(`/notes/${note.id}`);
    } catch (err) {
      // Error already surfaced through the notes context banner.
      console.error("Note creation failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    if (pathname === `${NOTE_URL_PREFIX}${id}`) {
      router.push("/");
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      await renameNote(id, title);
    } catch (err) {
      // Error already surfaced through the notes context banner.
      console.error("Rename failed:", err);
    }
  };

  return (
    <aside className="w-64 border-r border-border-thin bg-background-panel flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border-thin">
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
          Workspace
        </span>
        <button
          onClick={() => handleCreate(null)}
          className="text-text-muted hover:text-accent-neon border border-border-thin hover:border-accent-neon rounded-sm p-1 transition-colors"
          title="New note"
          aria-label="New note"
        >
          <Plus size={13} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-1.5" aria-label="Note tree">
        {tree.length === 0 ? (
          <p className="px-3 py-4 text-xs font-mono text-text-muted">
            Empty workspace. Create your first note.
          </p>
        ) : (
          tree.map((node) => (
            <NoteNode
              key={node.id}
              node={node}
              depth={0}
              collapsed={collapsed}
              activeNoteId={activeNoteId}
              onToggleCollapse={toggleCollapse}
              onCreateChild={handleCreate}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))
        )}
      </nav>

      {error && (
        <div className="m-2 p-2 border border-accent-amber/50 bg-accent-amber/10 rounded-sm text-[11px] font-mono text-accent-amber">
          {error}
        </div>
      )}
    </aside>
  );
}

function NoteNode({
  node,
  depth,
  collapsed,
  activeNoteId,
  onToggleCollapse,
  onCreateChild,
  onDelete,
  onRename,
}: {
  node: NoteTreeItem;
  depth: number;
  collapsed: Set<string>;
  activeNoteId: string | null;
  onToggleCollapse: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;
  const isActive = node.id === activeNoteId;
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (deleteResetTimer.current) clearTimeout(deleteResetTimer.current);
    };
  }, []);

  const startDeleteConfirm = () => {
    setConfirmingDelete(true);
    // Second click must happen quickly, otherwise reset to avoid
    // accidental destructive actions.
    deleteResetTimer.current = setTimeout(() => setConfirmingDelete(false), 2500);
  };

  const confirmDelete = () => {
    if (deleteResetTimer.current) clearTimeout(deleteResetTimer.current);
    setConfirmingDelete(false);
    onDelete(node.id);
  };

  const submitRename = (value: string) => {
    const trimmed = value.trim();
    setRenaming(false);
    if (!trimmed || trimmed === node.title) return;
    onRename(node.id, trimmed);
  };

  return (
    <div>
      {renaming ? (
        <input
          autoFocus
          defaultValue={node.title}
          onBlur={(e) => submitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
          className="w-full bg-background-steel border border-accent-neon rounded-sm text-sm text-text-primary px-2 py-1.5 my-0.5 focus:outline-none"
          style={{ marginLeft: depth * 14 + 26 }}
          aria-label="Rename note"
        />
      ) : (
        <div
          className={`group flex items-center rounded-sm pr-1 hover:bg-background-steel transition-colors ${
            isActive ? "bg-accent-neon/10" : ""
          }`}
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <button
            onClick={() => onToggleCollapse(node.id)}
            className={`p-1 text-text-muted shrink-0 ${hasChildren ? "hover:text-text-primary" : "pointer-events-none opacity-0"}`}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            aria-expanded={hasChildren ? !isCollapsed : undefined}
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>

          <Link
            href={`/notes/${node.id}`}
            prefetch={true}
            className={`flex-1 flex items-center gap-1.5 min-w-0 py-1.5 text-sm truncate ${
              isActive ? "text-accent-neon" : "text-text-primary/90"
            }`}
          >
            <span className="text-xs shrink-0">
              {node.emoji_icon ?? <FileText size={12} className="text-text-muted" />}
            </span>
            <span className="truncate">{node.title}</span>
          </Link>

          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setRenaming(true)}
              className="p-1 text-text-muted hover:text-text-primary rounded-sm transition-colors"
              title="Rename"
              aria-label={`Rename ${node.title}`}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onCreateChild(node.id)}
              className="p-1 text-text-muted hover:text-accent-neon rounded-sm transition-colors"
              title="New sub-note"
              aria-label={`Create sub-note under ${node.title}`}
            >
              <Plus size={13} />
            </button>
            {confirmingDelete ? (
              <button
                onClick={confirmDelete}
                className="p-1 text-background-base bg-accent-amber rounded-sm text-[9px] font-mono uppercase px-1.5 transition-colors"
                title="Confirm delete"
              >
                Del?
              </button>
            ) : (
              <button
                onClick={startDeleteConfirm}
                className="p-1 text-text-muted hover:text-accent-amber rounded-sm transition-colors"
                title="Delete"
                aria-label={`Delete ${node.title}`}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <NoteNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              activeNoteId={activeNoteId}
              onToggleCollapse={onToggleCollapse}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
