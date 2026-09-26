"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, EllipsisVertical, Redo2, Undo2 } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import type { Block, BlockConnection, LayoutType, Note } from "@/lib/types";
import { findNotePath, findFolderPath } from "@/lib/workspace-tree";
import { useMediaQuery } from "@/lib/use-media-query";
import { Breadcrumb } from "@/components/breadcrumb";
import { BlockEditor, type EditorUndoState } from "@/components/editor/block-editor";
import type { NoteMenuUndoRedo } from "@/components/note-menu";
import { CanvasView } from "@/components/canvas/canvas-view";
import { NoteTitleEditor } from "@/components/note-header";
import { NoteMenu } from "@/components/note-menu";
import { parseBlockIdFromHash } from "@/lib/search";

/**
 * Icon construct — the concept's stroke-draw + dot-pop figures. The
 * `.built` class is added a frame after mount (and on every
 * activation) so the strokes draw themselves; removed on
 * deactivation so the next switch replays.
 */
function ConstructIcon({ variant, active }: { variant: "document" | "canvas"; active: boolean }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.classList.remove("built");
      return;
    }
    const raf = requestAnimationFrame(() => el.classList.add("built"));
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (variant === "document") {
    return (
      <svg ref={ref} viewBox="0 0 26 26" aria-hidden="true">
        <path pathLength={1} className="p p1" d="M6 3h11l4 4v16H6z" />
        <path pathLength={1} className="p p2" d="M17 3v4h4" />
        <path pathLength={1} className="p p3" d="M9.5 12h8M9.5 15.5h8M9.5 19h5" />
      </svg>
    );
  }
  return (
    <svg ref={ref} viewBox="0 0 26 26" aria-hidden="true">
      <g className="pdots">
        <circle cx="5" cy="5" r="1.7" /><circle cx="13" cy="5" r="1.7" /><circle cx="21" cy="5" r="1.7" />
        <circle cx="5" cy="13" r="1.7" /><circle cx="21" cy="13" r="1.7" />
        <circle cx="5" cy="21" r="1.7" /><circle cx="13" cy="21" r="1.7" /><circle cx="21" cy="21" r="1.7" />
      </g>
      <rect pathLength={1} className="p p2" x="9" y="9" width="9" height="6" rx="1" />
    </svg>
  );
}

/** How long the outgoing pane stays mounted for its exit transition. */
const PANE_EXIT_MS = 500;

/** Monospace breadcrumb showing the note's ancestor folders, rooted at
 *  WORKSPACE. Empty/absent when the note lives at the workspace root.
 *  Breadcrumb truncates the MIDDLE segments first — the leaf of the
 *  chain (and the note title beside it) is never the thing that gets
 *  cut (make/design.md §7).
 */
function FolderPath({ path }: { path: ReturnType<typeof findFolderPath> }) {
  const names = path ? path.map((f) => f.name) : [];
  if (names.length === 0) return null;
  return (
    <Breadcrumb
      segments={["WORKSPACE", ...names]}
      className="folder-path"
      ariaLabel="Folder path"
    />
  );
}

export function NoteLayoutView({ note }: { note: Note }) {
  const { updateNote, tree } = useWorkspace();
  const router = useRouter();
  const [layout, setLayout] = useState<LayoutType>(note.layout_type);
  const [blocks, setBlocks] = useState<Block[]>(note.blocks);
  const [connections, setConnections] = useState<BlockConnection[]>(note.block_connections ?? []);
  const [editorUndoState, setEditorUndoState] = useState<EditorUndoState | null>(null);
  // The pane that is animating out (kept mounted until its transition
  // finishes — the concept's cross-fade + slide).
  const [exiting, setExiting] = useState<LayoutType | null>(null);
  // The action menu (⋯ in the bar).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Below ~360px the undo/redo pill and the ⋯ trigger collapse into
  // the menu's single ⋮ overflow (design.md §9): the pill is not
  // rendered and UNDO/REDO ride as rows inside the action menu.
  const isUltraNarrow = useMediaQuery("(max-width: 359px)");

  // Live metadata from the context tree (saveBlocks refreshes the node
  // on every quiet autosave; the menu's pin/lock toggles update it
  // optimistically), falling back to the SSR value.
  const liveNode = useMemo(() => {
    const path = findNotePath(tree, note.id);
    return path ? path.note : null;
  }, [tree, note.id]);
  const menuNote = liveNode ?? note;
  const readOnly = menuNote.read_only;
  /** UNDO/REDO handed to the action menu below ~360px (else undefined —
   *  the pill renders inline instead; desktop never passes this). */
  const undoRedoInMenu: NoteMenuUndoRedo | undefined =
    isUltraNarrow && layout === "document" && editorUndoState && !readOnly
      ? {
          undo: editorUndoState.undo,
          redo: editorUndoState.redo,
          canUndo: editorUndoState.canUndo,
          canRedo: editorUndoState.canRedo,
        }
      : undefined;
  // Ancestor chain for the monospace folder-path label in the command bar.
  const folderPath = useMemo(() => {
    if (!note.folder_id) return null;
    return findFolderPath(tree, note.folder_id);
  }, [tree, note.folder_id]);

  useEffect(() => {
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  const handleBlocksChange = useCallback((nextBlocks: Block[]) => {
    setBlocks(nextBlocks);
  }, []);

  const handleCanvasChange = useCallback((nextBlocks: Block[], nextConns: BlockConnection[]) => {
    setBlocks(nextBlocks);
    setConnections(nextConns);
  }, []);

  const handleToggle = useCallback(
    (nextLayout: LayoutType) => {
      if (nextLayout === layout) return;
      // Cross-fade: the current pane animates out, the incoming pane
      // mounts fresh (CanvasView re-seeds its blocks on mount, so it
      // must remount to pick up document-mode edits).
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setExiting(layout);
      setLayout(nextLayout);
      exitTimer.current = setTimeout(() => setExiting(null), PANE_EXIT_MS);
      updateNote(note.id, { layout_type: nextLayout }).catch((err) => {
        console.error("Failed to update layout type:", err);
      });
    },
    [layout, note.id, updateNote]
  );

  /**
   * Called by CanvasNode double-click — switches to document view and scrolls
   * to that block with a 2s gold highlight. Uses instant scroll so the animation
   * doesn't run while the user waits. Only highlights once the element is in the
   * viewport (scroll is instant, so by the time the second rAF fires, the element
   * is visible). Scrolls to the top of the block, not the center.
   */
  const handleOpenInDocument = useCallback(
    (blockId: string) => {
      if (layout !== "document") handleToggle("document");
      updateNote(note.id, { layout_type: "document" }).catch(() => {});
      // Two rAFs: first lets React commit the BlockEditor to the DOM;
      // second ensures layout has been calculated before we query positions.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`block-${blockId}`);
          if (!el) return;
          // Instant scroll to top of the block — no animation delay before highlight
          el.scrollIntoView({ behavior: "instant", block: "start" });
          // Flash the highlight — 2 second duration (matches animation in globals.css)
          el.classList.add("block-highlight");
          setTimeout(() => el.classList.remove("block-highlight"), 2000);
        });
      });
    },
    [handleToggle, layout, note.id, updateNote]
  );

  /**
   * Deep-link jump-to-the-line handler.
   * Smoothly scrolls to target block and flashes electric neon (#D1FF4D) for 1.5s.
   * Switches to document layout if currently viewing spatial canvas.
   */
  const scrollToBlock = useCallback(
    (targetBlockId: string) => {
      if (layout !== "document") {
        handleToggle("document");
        updateNote(note.id, { layout_type: "document" }).catch(() => {});
      }

      let attempts = 0;
      const tryScroll = () => {
        const el = document.getElementById(`block-${targetBlockId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("neon-flash");
          setTimeout(() => el.classList.remove("neon-flash"), 1500);
        } else if (attempts < 10) {
          attempts++;
          setTimeout(tryScroll, 60);
        }
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(tryScroll);
      });
    },
    [handleToggle, layout, note.id, updateNote]
  );

  useEffect(() => {
    const handleHash = () => {
      if (typeof window === "undefined") return;
      const targetBlockId = parseBlockIdFromHash(window.location.hash);
      if (targetBlockId) {
        scrollToBlock(targetBlockId);
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => {
      window.removeEventListener("hashchange", handleHash);
    };
  }, [scrollToBlock]);

  const docActive = layout === "document";
  const canActive = layout === "canvas";

  return (
    <div className="note-body">
      {/* Glass command bar — one 48px row over the panes: back-link +
          inline title, segmented Document/Canvas control, undo/redo,
          and the ⋯ action menu (export, last edited, pin, read-only,
          trash — the bar stays clean; the panes ride up underneath it
          so scrolling/paning content passes beneath the blur). */}
      <header className="note-bar">
        <div className="nb-left">
          <FolderPath path={folderPath} />
          <NoteTitleEditor noteId={note.id} title={note.title} readOnly={readOnly} />
          {readOnly && <span className="nb-lock">READ-ONLY</span>}
        </div>

        {/* The segmented DOCUMENT/CANVAS pair, desktop structure intact —
            on mobile the words drop away (CSS hides .fig-tab-label and
            the index <i>), leaving icon | icon (design.md §9). */}
        <div className="nb-seg" role="tablist" aria-label="Note surfaces">
          <button
            type="button"
            role="tab"
            aria-selected={docActive}
            className={`fig-tab${docActive ? " is-active" : ""}`}
            onClick={() => handleToggle("document")}
            title="Switch to vertical document view"
          >
            <span className="ti"><ConstructIcon variant="document" active={docActive} /></span>
            <span className="fig-tab-label">DOCUMENT</span> <i>01</i>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={canActive}
            className={`fig-tab${canActive ? " is-active" : ""}`}
            onClick={() => handleToggle("canvas")}
            title="Switch to spatial canvas view"
          >
            <span className="ti"><ConstructIcon variant="canvas" active={canActive} /></span>
            <span className="fig-tab-label">CANVAS</span> <i>02</i>
          </button>
        </div>

        <div className="nb-right">
          {/* Document Mode Undo / Redo (canvas has its own in the HUD).
              Below ~360px the pill collapses — undo/redo move into the
              ⋯ action menu instead (design.md §9). */}
          {docActive && editorUndoState && !readOnly && !isUltraNarrow && (
            <div className="undo-pill">
              <button
                type="button"
                onClick={editorUndoState.undo}
                disabled={!editorUndoState.canUndo}
                className="undo-btn"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 size={13} />
              </button>
              <button
                type="button"
                onClick={editorUndoState.redo}
                disabled={!editorUndoState.canRedo}
                className="undo-btn"
                title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 size={13} />
              </button>
            </div>
          )}

          {/* Action menu — export, last edited, pin, read-only, trash.
              Below ~360px it IS the single ⋮ overflow (undo/redo ride
              as rows inside, via the undoRedo slot). */}
          <button
            ref={menuBtnRef}
            type="button"
            className="nb-menu-btn"
            onClick={() => setMenuOpen((open) => !open)}
            title="Note actions"
            aria-label="Note actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {isUltraNarrow ? <EllipsisVertical size={20} /> : <Ellipsis size={15} />}
          </button>
          {menuOpen && (
            <NoteMenu
              anchorRef={menuBtnRef}
              note={menuNote}
              undoRedo={undoRedoInMenu}
              onClose={() => setMenuOpen(false)}
              onDeleted={() => router.push("/dashboard")}
            />
          )}
        </div>
      </header>

      {/* Panes — cross-fade + slide (the concept's .pane system). The
          incoming pane mounts fresh; the outgoing pane stays mounted
          for the exit transition, then unmounts. */}
      <div className="pane-stage">
        {(docActive || exiting === "document") && (
          <div
            className={`pane pane-doc${docActive ? " on" : " exit-l"}`}
            role="tabpanel"
            aria-label="Document view"
          >
            <div className={`doc-wrap${readOnly ? " is-locked" : ""}`}>
              <BlockEditor
                noteId={note.id}
                initialBlocks={blocks}
                onBlocksChange={handleBlocksChange}
                onUndoStateChange={setEditorUndoState}
              />
            </div>
          </div>
        )}
        {(canActive || exiting === "canvas") && (
          <div
            className={`pane pane-can${canActive ? " on" : " exit-r"}`}
            role="tabpanel"
            aria-label="Canvas view"
          >
            {/* Canvas is exempt from the read-only lock (user decision):
                node drags and connections save spatial data only and
                the server accepts canvas-metadata-only PUTs. */}
            <CanvasView
              noteId={note.id}
              initialBlocks={blocks}
              initialConnections={connections}
              onChange={handleCanvasChange}
              onOpenInDocument={handleOpenInDocument}
            />
          </div>
        )}
      </div>
    </div>
  );
}
