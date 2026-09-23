"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Palette,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/context/workspace-context";
import { findNotePath } from "@/lib/workspace-tree";
import { NS_COLOR_KEYS, NS_COLORS } from "@/lib/ns-colors";
import {
  persistCollapsed,
  updateCollapsed,
  useSidebarCollapsed,
} from "@/lib/sidebar-collapse";
import { deskToast } from "@/components/desk/desk-chrome";
import type { FolderTreeItem, NoteListItem } from "@/lib/types";

const NOTE_URL_PREFIX = "/notes/";
const ROOT_DROP_ID = "root";
/** One indentation step per depth level (px) — cumulative by construction. */
const INDENT_STEP = 20;

type ItemKind = "note" | "folder";
interface DragItem {
  kind: ItemKind;
  id: string;
}

interface RowActions {
  onToggleCollapse: (id: string) => void;
  onCreateNote: (folderId: string) => void;
  onCreateFolder: (folderId: string) => void;
  onDeleteNote: (id: string) => void;
  onRequestDeleteFolder: (folder: FolderTreeItem) => void;
  onRenameNote: (id: string, title: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onColorSet: (kind: ItemKind, id: string, color: string | null) => void;
}

interface DndState {
  dropTarget: string | null;
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    kind: ItemKind,
    id: string
  ) => void;
  onNoteDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onFolderDragOver: (
    e: React.DragEvent<HTMLDivElement>,
    folderId: string
  ) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onNoteDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFolderDrop: (e: React.DragEvent<HTMLDivElement>, folderId: string) => void;
  onRootDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function parseDragItem(e: React.DragEvent): DragItem | null {
  try {
    const raw = e.dataTransfer.getData("application/x-jam-item");
    if (!raw) return null;
    const item: unknown = JSON.parse(raw);
    if (
      typeof item === "object" &&
      item !== null &&
      "kind" in item &&
      "id" in item
    ) {
      const kind = (item as { kind: unknown }).kind;
      const id = (item as { id: unknown }).id;
      if ((kind === "note" || kind === "folder") && typeof id === "string") {
        return { kind, id };
      }
    }
  } catch {
    // Malformed payload — treat as a no-op drag.
  }
  return null;
}

/**
 * Indent cells (Phase 6 guide lines): every row renders one 20px cell
 * per ancestor level, before the caret. The cell's ::before draws that
 * level's 1px vertical rule (left: 9px inside the cell = depth × 20 +
 * 9 from the row's content edge), spanning the FULL row height and
 * painted behind the label (z-index:-1) — the line lives strictly in
 * the indent gutter and can never overlap the text column, at any
 * depth, with any title length (titles truncate, cells don't move).
 * Stacked rows connect into one continuous line per folder, colored by
 * that folder's effective accent (neutral paper tone when unset), and
 * each sibling subtree carries its own cells — nothing is shared.
 */
function IndentCells({ hues }: { hues: ReadonlyArray<string | null> }) {
  return (
    <>
      {hues.map((hue, level) => (
        <span
          key={level}
          className="ns-cell"
          style={
            hue
              ? ({ "--ns-line": NS_COLORS[hue] } as React.CSSProperties)
              : undefined
          }
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/**
 * Swatch popover for the Phase 6 accent: pastel palette + CLEAR.
 * Floating-UI rendered in a portal on document.body, so the sidebar's
 * bounds (narrow column, internal scroll, overflow) never clip it.
 * Collision middleware auto-flips it upward when the anchored row sits
 * near the bottom (deeply nested items) and shifts it inside the
 * viewport; the width always fits its content.
 */
function ColorSwatchPop({
  anchorRef,
  current,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  current: string | null;
  onPick: (color: string | null) => void;
  onClose: () => void;
}) {
  const { refs: popRefs, floatingStyles } = useFloating({
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const floatingElRef = useRef<HTMLDivElement | null>(null);

  // Wire the anchor elements in effects, never during render — the
  // linter (rightly) forbids render-phase reads of hook-returned ref
  // objects. The trigger row already exists; the portal node attaches
  // in the same commit, and Floating UI recomputes before paint.
  useEffect(() => {
    popRefs.setReference(anchorRef.current);
    popRefs.setFloating(floatingElRef.current);
    return () => {
      popRefs.setReference(null);
      popRefs.setFloating(null);
    };
  }, [popRefs, anchorRef]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (
        popRefs.floating.current &&
        !popRefs.floating.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, popRefs]);

  return createPortal(
    <div
      ref={floatingElRef}
      style={floatingStyles}
      className="sw-pop"
      role="dialog"
      aria-label="Accent color"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="sw-cap">ACCENT</p>
      <div className="sw-row">
        {NS_COLOR_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`sw-dot${current === key ? " is-on" : ""}`}
            style={{ background: NS_COLORS[key] }}
            title={key}
            aria-label={`${key} accent`}
            onClick={() => onPick(key)}
          />
        ))}
        <button
          type="button"
          className="sw-clear"
          onClick={() => onPick(null)}
        >
          CLEAR
        </button>
      </div>
    </div>,
    document.body
  );
}

export function Sidebar() {
  const {
    tree,
    createNote,
    createFolder,
    deleteNote,
    deleteFolder,
    renameNote,
    renameFolder,
    moveNote,
    moveFolder,
    setFolderColor,
    setNoteColor,
    error,
  } = useWorkspace();
  // Collapse state lives in a persisted store (lib/sidebar-collapse):
  // refreshes keep the exact open/collapsed folders the user left.
  // The effect write-through is what persists — render only mutates
  // the in-memory cache.
  const collapsed = useSidebarCollapsed();
  useEffect(() => {
    persistCollapsed(collapsed);
  }, [collapsed]);
  const [confirmFolder, setConfirmFolder] = useState<FolderTreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const activeNoteId = pathname.startsWith(NOTE_URL_PREFIX)
    ? pathname.slice(NOTE_URL_PREFIX.length)
    : null;

  // Auto-expand the ancestors of the active note so it is always
  // visible, even when reached via search. Runs as an effect (an
  // external-store update, like dispatching an event) — notifying
  // store listeners during render is the forbidden setState-in-render;
  // the ref guard keeps manual collapses between navigations intact.
  const prevActiveNoteIdRef = useRef<string | null>(activeNoteId);
  useEffect(() => {
    if (activeNoteId === prevActiveNoteIdRef.current) return;
    prevActiveNoteIdRef.current = activeNoteId;
    const path = activeNoteId ? findNotePath(tree, activeNoteId) : null;
    if (!path) return;
    const next = new Set(collapsed);
    let changed = false;
    for (const folder of path.folders) {
      if (next.delete(folder.id)) changed = true;
    }
    if (changed) updateCollapsed(next);
  }, [activeNoteId, collapsed, tree]);

  // Active-location chain (Phase 6 fix): every folder between the root
  // and the open note carries the accent, so collapsing any level still
  // traces the path down to the current file. Recomputed per render from
  // the active id — it clears/moves automatically on navigation.
  const activePath = activeNoteId ? findNotePath(tree, activeNoteId) : null;
  const activeChainIds: ReadonlySet<string> = new Set(
    activePath ? activePath.folders.map((f) => f.id) : []
  );

  const toggleCollapse = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    updateCollapsed(next);
  };

  // VS Code-style collapse/expand-all toggle: collapses every folder at
  // any depth; when everything is already collapsed it expands all.
  const allFolderIds: string[] = [];
  const walkFolders = (nodes: readonly FolderTreeItem[]) => {
    for (const node of nodes) {
      allFolderIds.push(node.id);
      walkFolders(node.folders);
    }
  };
  walkFolders(tree.folders);
  const allCollapsed =
    allFolderIds.length > 0 && allFolderIds.every((id) => collapsed.has(id));
  const toggleCollapseAll = () => {
    updateCollapsed(allCollapsed ? new Set() : new Set(allFolderIds));
  };

  const reveal = (folderId: string | null) => {
    if (!folderId) return;
    if (!collapsed.has(folderId)) return;
    const next = new Set(collapsed);
    next.delete(folderId);
    updateCollapsed(next);
  };

  const isEmpty = tree.folders.length === 0 && tree.notes.length === 0;

  const handleCreateNote = async (folderId: string | null) => {
    try {
      const note = await createNote({ title: "Untitled", folder_id: folderId ?? null });
      reveal(folderId);
      router.push(`/notes/${note.id}`);
    } catch (err) {
      console.error("Note creation failed:", err);
    }
  };

  const handleCreateFolder = async (parentFolderId: string | null) => {
    try {
      await createFolder({
        name: "Untitled",
        parent_folder_id: parentFolderId ?? null,
      });
      reveal(parentFolderId);
      deskToast("FOLDER FILED — UNTITLED.");
    } catch (err) {
      console.error("Folder creation failed:", err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      const { purged } = await deleteNote(id);
      // Empty notes skip the trash — they are shredded right away.
      deskToast(
        purged
          ? "EMPTY NOTE SHREDDED — NOTHING TO RESTORE."
          : "NOTE FILED TO TRASH — 30 DAYS."
      );
    } catch {
      deskToast("DELETE FAILED — NOTE STILL FILED.");
      return;
    }
    if (pathname === `${NOTE_URL_PREFIX}${id}`) {
      router.push("/dashboard");
    }
  };

  const requestDeleteFolder = (folder: FolderTreeItem) => {
    setConfirmFolder(folder);
  };

  const confirmDeleteFolder = async () => {
    if (!confirmFolder) return;
    await deleteFolder(confirmFolder.id);
    deskToast("FOLDER REMOVED — CONTENTS LIFTED UP.");
    setConfirmFolder(null);
  };

  const clearDrag = () => {
    setDropTarget(null);
  };

  const handleDropOnFolder = async (
    e: React.DragEvent<HTMLDivElement>,
    folderId: string
  ) => {
    e.preventDefault();
    const item = parseDragItem(e);
    setDropTarget(null);
    if (!item) return;
    if (item.kind === "note") {
      await moveNote(item.id, folderId);
    } else {
      await moveFolder(item.id, folderId);
    }
  };

  const handleDropOnRoot = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const item = parseDragItem(e);
    setDropTarget(null);
    if (!item) return;
    if (item.kind === "note") {
      await moveNote(item.id, null);
    } else {
      await moveFolder(item.id, null);
    }
  };

  const rejectNoteDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const item = parseDragItem(e);
    if (!item) return;
    // Lawful drop target is a folder (or root) only — anything dropped
    // on a note is rejected with a toast.
    deskToast("FOLDERS ONLY — A NOTE CAN'T CONTAIN ANYTHING.");
  };

  const dnd: DndState = {
    dropTarget,
    onDragStart: (e, kind, id) => {
      e.dataTransfer.setData(
        "application/x-jam-item",
        JSON.stringify({ kind, id })
      );
      e.dataTransfer.effectAllowed = "move";
      (e.currentTarget as HTMLElement).classList.add("is-dragged");
    },
    onNoteDragOver: (e) => {
      // preventDefault permits the drop event to fire so onNoteDrop can
      // reject it with the toast — a "none" dropEffect here makes the
      // browser skip the drop entirely and the toast unreachable.
      e.preventDefault();
    },
    onFolderDragOver: (e, folderId) => {
      e.preventDefault();
      if (dropTarget !== folderId) setDropTarget(folderId);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDropTarget(null);
      }
    },
    onNoteDrop: rejectNoteDrop,
    onFolderDrop: (e, folderId) => handleDropOnFolder(e, folderId),
    onRootDrop: handleDropOnRoot,
    onDragEnd: () => {
      document.querySelectorAll(".is-dragged").forEach((el) => {
        (el as HTMLElement).classList.remove("is-dragged");
      });
      clearDrag();
    },
  };

  const actions: RowActions = {
    onToggleCollapse: toggleCollapse,
    onCreateNote: handleCreateNote,
    onCreateFolder: handleCreateFolder,
    onDeleteNote: handleDeleteNote,
    onRequestDeleteFolder: requestDeleteFolder,
    onRenameNote: (id, title) => renameNote(id, title).catch(() => {}),
    onRenameFolder: (id, name) => renameFolder(id, name).catch(() => {}),
    onColorSet: (kind, id, color) => {
      if (kind === "folder") {
        setFolderColor(id, color).catch(() => {});
      } else {
        setNoteColor(id, color).catch(() => {});
      }
    },
  };

  const rootFolders = tree.folders;
  const rootNotes = tree.notes;

  return (
    <aside className="side chrome">
      <div className="side-sec">
        <div
          className={`side-head${dropTarget === ROOT_DROP_ID ? " is-drop" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (dropTarget !== ROOT_DROP_ID) setDropTarget(ROOT_DROP_ID);
          }}
          onDragLeave={dnd.onDragLeave}
          onDrop={dnd.onRootDrop}
        >
          <p className="kicker">WORKSPACE</p>
          <div className="side-adds">
            <button
              onClick={() => handleCreateNote(null)}
              className="side-add side-add-note"
              title="New note"
              aria-label="New note"
              type="button"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => handleCreateFolder(null)}
              className="side-add side-add-folder"
              title="New folder"
              aria-label="New folder"
              type="button"
            >
              <Folder size={12} />
            </button>
            {allFolderIds.length > 0 && (
              <button
                onClick={toggleCollapseAll}
                className="side-add side-add-fold"
                title={allCollapsed ? "Expand all folders" : "Collapse all folders"}
                aria-label={allCollapsed ? "Expand all folders" : "Collapse all folders"}
                aria-pressed={allCollapsed}
                type="button"
              >
                {allCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
              </button>
            )}
          </div>
        </div>
        {isEmpty && (
          <p className="side-empty">
            Empty workspace. Create your first note or folder.
          </p>
        )}
      </div>

      {!isEmpty && (
        <nav className="ns-list" aria-label="Workspace">
          {rootFolders.map((folder, index) => (
            <FolderNode
              key={folder.id}
              node={folder}
              depth={0}
              index={index}
              collapsed={collapsed}
              activeNoteId={activeNoteId}
              activeChainIds={activeChainIds}
              ancestorHues={[]}
              actions={actions}
              dnd={dnd}
            />
          ))}
          {rootNotes.map((note, index) => (
            <NoteLeaf
              key={note.id}
              note={note}
              depth={0}
              index={rootFolders.length + index}
              activeNoteId={activeNoteId}
              ancestorHues={[]}
              actions={actions}
              dnd={dnd}
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

      {confirmFolder && (
        <FolderDeletePopup
          folder={confirmFolder}
          onCancel={() => setConfirmFolder(null)}
          onConfirm={confirmDeleteFolder}
        />
      )}
    </aside>
  );
}

function FolderNode({
  node,
  depth,
  index,
  collapsed,
  activeNoteId,
  activeChainIds,
  ancestorHues,
  actions,
  dnd,
}: {
  node: FolderTreeItem;
  depth: number;
  index: number;
  collapsed: ReadonlySet<string>;
  activeNoteId: string | null;
  activeChainIds: ReadonlySet<string>;
  /** Effective accent of each ancestor level (root…parent; null = none). */
  ancestorHues: ReadonlyArray<string | null>;
  actions: RowActions;
  dnd: DndState;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.folders.length > 0 || node.notes.length > 0;
  const [renaming, setRenaming] = useState(false);
  const [colorPop, setColorPop] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Own accent wins over the inherited one; children inherit the
  // effective color — overrides never propagate back up.
  const inherited =
    ancestorHues.length > 0 ? ancestorHues[ancestorHues.length - 1] : null;
  const effectiveColor = node.color ?? inherited ?? null;
  const isChain = activeChainIds.has(node.id);

  const submitRename = (value: string) => {
    const trimmed = value.trim();
    setRenaming(false);
    if (!trimmed || trimmed === node.name) return;
    actions.onRenameFolder(node.id, trimmed);
  };

  const isDrop = dnd.dropTarget === node.id;

  return (
    <div className={depth > 0 ? "ns-child" : undefined}>
      {renaming ? (
        <input
          autoFocus
          defaultValue={node.name}
          onBlur={(e) => submitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
          className="rename-input"
          style={{ marginLeft: 10 + depth * INDENT_STEP }}
          aria-label="Rename folder"
        />
      ) : (
        <div
          ref={rowRef}
          className={`ns-item ns-folder${isDrop ? " is-drop" : ""}${
            isChain ? " is-chain" : ""
          }`}
          data-c={effectiveColor ?? undefined}
          draggable
          onDragStart={(e) => dnd.onDragStart(e, "folder", node.id)}
          onDragEnd={dnd.onDragEnd}
          onDragOver={(e) => dnd.onFolderDragOver(e, node.id)}
          onDragLeave={dnd.onDragLeave}
          onDrop={(e) => dnd.onFolderDrop(e, node.id)}
          onClick={(e) => {
            // Clicking the row (title included) toggles the subtree —
            // the caret button is not the only handle anymore. Button
            // clicks (row actions, caret) are exempt via closest().
            if ((e.target as HTMLElement).closest("button")) return;
            if (!hasChildren) return;
            actions.onToggleCollapse(node.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setRenaming(false);
            setColorPop(true);
          }}
        >
          <IndentCells hues={ancestorHues} />
          <button
            onClick={() => actions.onToggleCollapse(node.id)}
            className="ns-caret"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            aria-expanded={!isCollapsed}
            type="button"
          >
            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          </button>

          {depth === 0 && <i>{String(index + 1).padStart(2, "0")}</i>}

          <Folder size={12} className="ns-icon" />
          <span className="ns-title" title={node.name}>
            {node.name}
          </span>

          <div className="row-actions">
            <button
              onClick={() => actions.onCreateNote(node.id)}
              className="row-btn"
              title="New note in folder"
              aria-label={`Create note in ${node.name}`}
              type="button"
            >
              <FilePlus size={11} />
            </button>
            <button
              onClick={() => actions.onCreateFolder(node.id)}
              className="row-btn"
              title="New subfolder"
              aria-label={`Create subfolder in ${node.name}`}
              type="button"
            >
              <FolderPlus size={11} />
            </button>
            <button
              onClick={() => setRenaming(true)}
              className="row-btn"
              title="Rename"
              aria-label={`Rename ${node.name}`}
              type="button"
            >
              <Pencil size={11} />
            </button>
            <button
              // stopPropagation keeps the click-away listener from
              // closing the popover right before this toggles it.
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setColorPop((v) => !v)}
              className={`row-btn${colorPop ? " is-on" : ""}`}
              title="Accent color"
              aria-label={`Set accent color for ${node.name}`}
              type="button"
            >
              <Palette size={11} />
            </button>
            <button
              onClick={() => actions.onRequestDeleteFolder(node)}
              className="row-btn"
              title="Remove folder"
              aria-label={`Remove ${node.name}`}
              type="button"
            >
              <Trash2 size={11} />
            </button>
          </div>

          {colorPop && (
            <ColorSwatchPop
              anchorRef={rowRef}
              current={node.color}
              onClose={() => setColorPop(false)}
              onPick={(color) => {
                setColorPop(false);
                actions.onColorSet("folder", node.id, color);
              }}
            />
          )}
        </div>
      )}

      {!isCollapsed && hasChildren && (
        <div>
          {node.folders.map((child, ci) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              index={ci}
              collapsed={collapsed}
              activeNoteId={activeNoteId}
              activeChainIds={activeChainIds}
              ancestorHues={[...ancestorHues, effectiveColor]}
              actions={actions}
              dnd={dnd}
            />
          ))}
          {node.notes.map((note) => (
            <NoteLeaf
              key={note.id}
              note={note}
              depth={depth + 1}
              index={0}
              activeNoteId={activeNoteId}
              ancestorHues={[...ancestorHues, effectiveColor]}
              actions={actions}
              dnd={dnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteLeaf({
  note,
  depth,
  index,
  activeNoteId,
  ancestorHues,
  actions,
  dnd,
}: {
  note: NoteListItem;
  depth: number;
  index: number;
  activeNoteId: string | null;
  /** Effective accent of each ancestor level (root…parent; null = none). */
  ancestorHues: ReadonlyArray<string | null>;
  actions: RowActions;
  dnd: DndState;
}) {
  const isActive = note.id === activeNoteId;
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [colorPop, setColorPop] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const deleteResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A note's own accent overrides the inherited one.
  const inherited =
    ancestorHues.length > 0 ? ancestorHues[ancestorHues.length - 1] : null;
  const effectiveColor = note.color ?? inherited ?? null;

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
    actions.onDeleteNote(note.id);
  };

  const submitRename = (value: string) => {
    const trimmed = value.trim();
    setRenaming(false);
    if (!trimmed || trimmed === note.title) return;
    actions.onRenameNote(note.id, trimmed);
  };

  return (
    <div className={depth > 0 ? "ns-child" : undefined}>
      {renaming ? (
        <input
          autoFocus
          defaultValue={note.title}
          onBlur={(e) => submitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
          className="rename-input"
          style={{ marginLeft: 10 + depth * INDENT_STEP }}
          aria-label="Rename note"
        />
      ) : (
        <div
          ref={rowRef}
          className={`ns-item ns-note${isActive ? " is-active" : ""}`}
          data-c={effectiveColor ?? undefined}
          draggable
          onDragStart={(e) => dnd.onDragStart(e, "note", note.id)}
          onDragEnd={dnd.onDragEnd}
          onDragOver={dnd.onNoteDragOver}
          onDragLeave={dnd.onDragLeave}
          onDrop={dnd.onNoteDrop}
          onContextMenu={(e) => {
            e.preventDefault();
            setRenaming(false);
            setColorPop(true);
          }}
        >
          <IndentCells hues={ancestorHues} />
          {/* Caret-width spacer keeps note titles aligned with folder rows. */}
          <span className="ns-spacer" aria-hidden="true" />

          {depth === 0 && <i>{String(index + 1).padStart(2, "0")}</i>}

          <FileText size={12} className="ns-icon" />
          <Link
            href={`/notes/${note.id}`}
            prefetch={true}
            className="ns-title"
            title={note.title}
            onDragStart={(e) => e.preventDefault()}
          >
            {note.title}
          </Link>

          <div className="row-actions">
            <button
              onClick={() => setRenaming(true)}
              className="row-btn"
              title="Rename"
              aria-label={`Rename ${note.title}`}
              type="button"
            >
              <Pencil size={11} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setColorPop((v) => !v)}
              className={`row-btn${colorPop ? " is-on" : ""}`}
              title="Accent color"
              aria-label={`Set accent color for ${note.title}`}
              type="button"
            >
              <Palette size={11} />
            </button>
            <button
              onClick={() => {
                if (confirmingDelete) {
                  confirmDelete();
                } else {
                  startDeleteConfirm();
                }
              }}
              className={confirmingDelete ? "del-chip" : "row-btn"}
              title={confirmingDelete ? "Confirm — file to trash (30 days)" : "File to trash (30 days)"}
              aria-label={confirmingDelete ? `Confirm filing ${note.title} to trash` : `File ${note.title} to trash`}
              type="button"
            >
              {confirmingDelete ? "TRASH?" : <Trash2 size={11} />}
            </button>
          </div>

          {colorPop && (
            <ColorSwatchPop
              anchorRef={rowRef}
              current={note.color}
              onClose={() => setColorPop(false)}
              onPick={(color) => {
                setColorPop(false);
                actions.onColorSet("note", note.id, color);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FolderDeletePopup({
  folder,
  onCancel,
  onConfirm,
}: {
  folder: FolderTreeItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const timer = setTimeout(() => {
      window.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div
      className="fdp-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Remove folder"
    >
      <div className="fdp-card" onClick={(e) => e.stopPropagation()}>
        <p className="fdp-cap">REMOVE FOLDER?</p>
        <p className="fdp-name">{folder.name}</p>
        <p className="fdp-copy">
          Notes and folders inside move up one level — nothing is deleted.
        </p>
        <div className="fdp-actions">
          <button type="button" className="fdp-cancel" onClick={onCancel}>
            CANCEL
          </button>
          <button type="button" className="fdp-confirm" onClick={onConfirm}>
            REMOVE FOLDER
          </button>
        </div>
      </div>
    </div>
  );
}
