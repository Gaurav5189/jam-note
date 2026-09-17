"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, LayoutGrid, Redo2, Undo2 } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import type { Block, BlockConnection, LayoutType, Note } from "@/lib/types";
import { BlockEditor, type EditorUndoState } from "@/components/editor/block-editor";
import { CanvasView } from "@/components/canvas/canvas-view";

export function NoteLayoutView({ note }: { note: Note }) {
  const { updateNote } = useNotes();
  const [layout, setLayout] = useState<LayoutType>(note.layout_type);
  const [blocks, setBlocks] = useState<Block[]>(note.blocks);
  const [connections, setConnections] = useState<BlockConnection[]>(note.block_connections ?? []);
  const [editorUndoState, setEditorUndoState] = useState<EditorUndoState | null>(null);
  const pendingScrollBlockId = useRef<string | null>(null);

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
      setLayout(nextLayout);
      updateNote(note.id, { layout_type: nextLayout }).catch((err) => {
        console.error("Failed to update layout type:", err);
      });
    },
    [layout, note.id, updateNote]
  );

  /**
   * Called by CanvasNode double-click — switches to document view and scrolls
   * to that block with a 2s neon highlight. Uses instant scroll so the animation
   * doesn't run while the user waits. Only highlights once the element is in the
   * viewport (scroll is instant, so by the time the second rAF fires, the element
   * is visible). Scrolls to the top of the block, not the center.
   */
  const handleOpenInDocument = useCallback(
    (blockId: string) => {
      pendingScrollBlockId.current = blockId;
      setLayout("document");
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
          pendingScrollBlockId.current = null;
        });
      });
    },
    [note.id, updateNote]
  );

  return (
    <div className="w-full">
      {/* Sticky sub-header: Document / Canvas toggle + Undo/Redo + meta — sticks below the global header */}
      <div className="sticky top-0 z-20 bg-background-base/95 backdrop-blur-xs border-b border-border-thin/50 -mx-8 px-8 py-2 mb-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-0.5 rounded-sm bg-background-panel border border-border-thin select-none">
            <button
              type="button"
              onClick={() => handleToggle("document")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[10px] font-mono uppercase tracking-wider transition-colors ${
                layout === "document"
                  ? "bg-background-steel text-accent-neon border border-accent-neon/40 shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
              title="Switch to vertical document view"
              aria-label="Document view"
            >
              <FileText size={11} />
              <span>Document</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggle("canvas")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[10px] font-mono uppercase tracking-wider transition-colors ${
                layout === "canvas"
                  ? "bg-background-steel text-accent-neon border border-accent-neon/40 shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
              title="Switch to spatial canvas view"
              aria-label="Canvas view"
            >
              <LayoutGrid size={11} />
              <span>Canvas</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Document Mode Undo / Redo controls in sticky header — aligned and safe from header collisions */}
            {layout === "document" && editorUndoState && (
              <div className="flex items-center gap-0.5 bg-background-panel border border-border-thin rounded-sm p-0.5 select-none shadow-xs">
                <button
                  type="button"
                  onClick={editorUndoState.undo}
                  disabled={!editorUndoState.canUndo}
                  className="p-1 rounded-xs text-text-muted hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <Undo2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={editorUndoState.redo}
                  disabled={!editorUndoState.canRedo}
                  className="p-1 rounded-xs text-text-muted hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
                  aria-label="Redo"
                >
                  <Redo2 size={12} />
                </button>
              </div>
            )}

            <span className="text-[10px] font-mono text-text-muted/70">
              created {note.created_at.slice(0, 10)} · updated {note.updated_at.slice(0, 16).replace("T", " ")} UTC
            </span>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {layout === "document" ? (
        <div className="max-w-[75ch] mx-auto">
          <BlockEditor
            noteId={note.id}
            initialBlocks={blocks}
            onBlocksChange={handleBlocksChange}
            onUndoStateChange={setEditorUndoState}
          />
        </div>
      ) : (
        <div className="w-full mt-2">
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
  );
}
