"use client";

import { memo } from "react";
import { Maximize2, Minus, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";

interface CanvasToolbarProps {
  scale: number;
  saveStatus: "idle" | "saving" | "saved" | "error";
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitAll: () => void;
}

function CanvasToolbarImpl({
  scale,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitAll,
}: CanvasToolbarProps) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed bottom-6 right-8 z-30 flex items-center gap-2 select-none"
    >
      {/* Save indicator */}
      {saveStatus !== "idle" && (
        <div className="px-2.5 py-1 rounded-sm bg-background-panel/90 border border-border-thin text-[10px] font-mono uppercase tracking-wider backdrop-blur-xs">
          {saveStatus === "saving" && (
            <span className="text-text-muted animate-pulse">Syncing…</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-accent-neon">Synced</span>
          )}
          {saveStatus === "error" && (
            <span className="text-accent-amber">Sync error</span>
          )}
        </div>
      )}

      {/* Navigation HUD */}
      <div className="flex items-center bg-background-panel/90 border border-border-thin rounded-sm divide-x divide-border-thin backdrop-blur-xs shadow-lg">
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 transition-colors ${
              canUndo
                ? "hover:bg-background-steel text-text-muted hover:text-text-primary cursor-pointer"
                : "text-text-muted/30 cursor-not-allowed"
            }`}
            title="Undo canvas change (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={13} />
          </button>
        )}

        {onRedo && (
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 transition-colors ${
              canRedo
                ? "hover:bg-background-steel text-text-muted hover:text-text-primary cursor-pointer"
                : "text-text-muted/30 cursor-not-allowed"
            }`}
            title="Redo canvas change (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={13} />
          </button>
        )}

        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 hover:bg-background-steel text-text-muted hover:text-text-primary transition-colors"
          title="Zoom out (−)"
          aria-label="Zoom out"
        >
          <Minus size={13} />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="px-2 py-1 text-[11px] font-mono hover:bg-background-steel text-text-muted hover:text-text-primary transition-colors min-w-[50px] text-center"
          title="Reset zoom to 100%"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 hover:bg-background-steel text-text-muted hover:text-text-primary transition-colors"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <Plus size={13} />
        </button>

        <button
          type="button"
          onClick={onFitAll}
          className="p-1.5 hover:bg-background-steel text-text-muted hover:text-text-primary transition-colors"
          title="Fit all nodes in view"
          aria-label="Fit all"
        >
          <Maximize2 size={13} />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="p-1.5 hover:bg-background-steel text-text-muted hover:text-text-primary transition-colors"
          title="Reset canvas center"
          aria-label="Reset canvas"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );
}

export const CanvasToolbar = memo(CanvasToolbarImpl);
