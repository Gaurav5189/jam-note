"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import type { Block, BlockConnection, LayoutType, Note } from "@/lib/types";
import { BlockEditor, type EditorUndoState } from "@/components/editor/block-editor";
import { CanvasView } from "@/components/canvas/canvas-view";

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

export function NoteLayoutView({ note }: { note: Note }) {
  const { updateNote } = useNotes();
  const [layout, setLayout] = useState<LayoutType>(note.layout_type);
  const [blocks, setBlocks] = useState<Block[]>(note.blocks);
  const [connections, setConnections] = useState<BlockConnection[]>(note.block_connections ?? []);
  const [editorUndoState, setEditorUndoState] = useState<EditorUndoState | null>(null);
  // The pane that is animating out (kept mounted until its transition
  // finishes — the concept's cross-fade + slide).
  const [exiting, setExiting] = useState<LayoutType | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const docActive = layout === "document";
  const canActive = layout === "canvas";

  return (
    <div className="note-body">
      {/* Pinned tabs bar — the Phase 4 quick-switch stays reachable on
          long documents (the pane scrolls beneath it). */}
      <div className="tabs-bar">
        <div className="fig-tabs" role="tablist" aria-label="Note surfaces">
          <button
            type="button"
            role="tab"
            aria-selected={docActive}
            className={`fig-tab${docActive ? " is-active" : ""}`}
            onClick={() => handleToggle("document")}
            title="Switch to vertical document view"
          >
            <span className="ti"><ConstructIcon variant="document" active={docActive} /></span>
            DOCUMENT <i>01</i>
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
            CANVAS <i>02</i>
          </button>
        </div>

        <div className="tabs-right">
          {/* Document Mode Undo / Redo controls in the pinned bar */}
          {docActive && editorUndoState && (
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

          <div className="note-meta">
            <span>CREATED — {note.created_at.slice(0, 10)}</span>
            <span className="meta-updated">
              UPDATED — {note.updated_at.slice(0, 16).replace("T", " ")} UTC
            </span>
          </div>
        </div>
      </div>

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
            <div className="doc-wrap">
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
