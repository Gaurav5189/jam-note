"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { findNotePath } from "@/lib/note-tree";
import type { NoteTreeItem } from "@/lib/types";
import { deskBurst, deskToast } from "@/components/desk/desk-chrome";

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
    deskBurst(innerWidth / 2, innerHeight / 2, "#ff3d1c");
    deskToast("NOTE SHREDDED — GONE.");
    if (pathname === `${NOTE_URL_PREFIX}${id}`) {
      router.push("/dashboard");
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
    <aside className="side chrome">
      <div className="side-sec">
        <div className="side-head">
          <p className="kicker">WORKSPACE</p>
          <button
            onClick={() => handleCreate(null)}
            className="side-add"
            title="New note"
            aria-label="New note"
          >
            +
          </button>
        </div>
        {tree.length === 0 && (
          <p className="side-empty">Empty workspace. Create your first note.</p>
        )}
      </div>

      {tree.length > 0 && (
        <nav className="ns-list" aria-label="Note tree">
          {tree.map((node, index) => (
            <NoteNode
              key={node.id}
              node={node}
              depth={0}
              index={index}
              collapsed={collapsed}
              activeNoteId={activeNoteId}
              onToggleCollapse={toggleCollapse}
              onCreateChild={handleCreate}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </nav>
      )}

      {error && <div className="side-error">{error}</div>}

      <div className="side-foot">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 0v20M0 10h20" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span>JAM NOTES — β</span>
      </div>
    </aside>
  );
}

function NoteNode({
  node,
  depth,
  index,
  collapsed,
  activeNoteId,
  onToggleCollapse,
  onCreateChild,
  onDelete,
  onRename,
}: {
  node: NoteTreeItem;
  depth: number;
  /** Position among its top-level siblings — index labels are for roots. */
  index: number;
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

  const indent = depth * 14 + 4;

  return (
    <div className={depth > 0 ? "ns-child" : undefined}>
      {renaming ? (
        <input
          autoFocus
          defaultValue={node.title}
          onBlur={(e) => submitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
          className="rename-input"
          style={{ marginLeft: indent }}
          aria-label="Rename note"
        />
      ) : (
        <div
          className={`ns-item${isActive ? " is-active" : ""}`}
          style={{ paddingLeft: 10 + indent }}
        >
          <button
            onClick={() => onToggleCollapse(node.id)}
            className={`ns-caret${hasChildren ? "" : " is-empty"}`}
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            aria-expanded={hasChildren ? !isCollapsed : undefined}
            type="button"
          >
            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          </button>

          {depth === 0 && <i>{String(index + 1).padStart(2, "0")}</i>}

          <Link
            href={`/notes/${node.id}`}
            prefetch={true}
            className="ns-title"
          >
            {node.title}
          </Link>

          <div className="row-actions">
            <button
              onClick={() => setRenaming(true)}
              className="row-btn"
              title="Rename"
              aria-label={`Rename ${node.title}`}
              type="button"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onCreateChild(node.id)}
              className="row-btn"
              title="New sub-note"
              aria-label={`Create sub-note under ${node.title}`}
              type="button"
            >
              <Plus size={13} />
            </button>
            {confirmingDelete ? (
              <button
                onClick={confirmDelete}
                className="del-chip"
                title="Confirm delete"
                type="button"
              >
                DEL?
              </button>
            ) : (
              <button
                onClick={startDeleteConfirm}
                className="row-btn"
                title="Delete"
                aria-label={`Delete ${node.title}`}
                type="button"
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
              index={0}
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
