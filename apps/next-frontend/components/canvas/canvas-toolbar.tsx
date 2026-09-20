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
      className="canvas-toolbar"
    >
      {/* Save indicator */}
      {saveStatus !== "idle" && (
        <div className={`ct-save ${saveStatus}`}>
          {saveStatus === "saving" && <span>SYNCING…</span>}
          {saveStatus === "saved" && <span>FILED</span>}
          {saveStatus === "error" && <span>SYNC ERROR</span>}
        </div>
      )}

      {/* Navigation HUD */}
      <div className="ct-group">
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="ct-btn"
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
            className="ct-btn"
            title="Redo canvas change (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={13} />
          </button>
        )}

        <button
          type="button"
          onClick={onZoomOut}
          className="ct-btn"
          title="Zoom out (−)"
          aria-label="Zoom out"
        >
          <Minus size={13} />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="ct-btn ct-scale"
          title="Reset zoom to 100%"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          className="ct-btn"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <Plus size={13} />
        </button>

        <button
          type="button"
          onClick={onFitAll}
          className="ct-btn"
          title="Fit all nodes in view"
          aria-label="Fit all"
        >
          <Maximize2 size={13} />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="ct-btn"
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
