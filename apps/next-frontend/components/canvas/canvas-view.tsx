"use client";

import { useCallback, useEffect, useRef } from "react";
import { Hand, MousePointer2 } from "lucide-react";
import type { Block, BlockConnection } from "@/lib/types";
import { useCanvasState } from "./use-canvas-state";
import { CanvasNode } from "./canvas-node";
import { CanvasConnections } from "./canvas-connections";
import { CanvasToolbar } from "./canvas-toolbar";
import { CANVAS_GRID } from "./types";

interface CanvasViewProps {
  noteId: string;
  initialBlocks: Block[];
  initialConnections?: BlockConnection[];
  onChange?: (blocks: Block[], connections: BlockConnection[]) => void;
  onOpenInDocument?: (blockId: string) => void;
}

export function CanvasView({
  noteId,
  initialBlocks,
  initialConnections = [],
  onChange,
  onOpenInDocument,
}: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const {
    blocks,
    cards,
    connections,
    transform,
    setTransform,
    tool,
    setTool,
    toggleTool,
    connectingFromId,
    saveStatus,
    canUndo,
    canRedo,
    undo,
    redo,
    recordSnapshotCurrent,
    updateNodePosition,
    updateNodeSize,
    cycleNodeColor,
    removeConnection,
    handlePortClick,
    cancelConnecting,
    zoomIn,
    zoomOut,
    resetZoom,
    fitAll,
  } = useCanvasState({
    noteId,
    initialBlocks,
    initialConnections,
    onChange,
  });

  const isHandMode = tool === "hand";

  // ─── Keyboard Shortcuts (Tab for Tool, Ctrl+Z for Undo/Redo) ───────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab to toggle between pointer and hand mode
      if (e.key === "Tab") {
        e.preventDefault();
        toggleTool();
        return;
      }

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleTool, undo, redo]);

  // ─── Canvas Panning ─────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // In Hand mode, clicking anywhere (even over cards) pans the canvas
      if (!isHandMode) {
        // In Pointer mode, only pan if clicking canvas background (not cards/buttons)
        if (
          e.target !== containerRef.current &&
          (e.target as HTMLElement)?.dataset?.canvasBackground !== "true"
        ) {
          return;
        }
      }

      if (e.button !== 0 && e.button !== 1) return; // Left or middle click
      e.currentTarget.setPointerCapture(e.pointerId);
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      cancelConnecting();
    },
    [cancelConnecting, isHandMode, transform.x, transform.y]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return;
      setTransform((prev) => ({
        ...prev,
        x: Math.round(e.clientX - panStartRef.current.x),
        y: Math.round(e.clientY - panStartRef.current.y),
      }));
    },
    [setTransform]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture release
      }
    }
  }, []);

  // ─── Wheel Zoom & Pan ───────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Don't zoom when the user is scrolling inside a card's content area.
      // Card content divs carry data-canvas-scrollable="true".
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-canvas-scrollable='true']")) return;

      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newScale = Math.max(0.25, Math.min(2.5, +(transform.scale * zoomFactor).toFixed(2)));

      if (newScale === transform.scale) return;

      const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

      setTransform({
        x: Math.round(newX),
        y: Math.round(newY),
        scale: newScale,
      });
    },
    [setTransform, transform]
  );

  // Cards come pre-folded from the canvas state — consecutive To-Do /
  // list-item runs are ONE card. Counts reflect cards, not raw blocks.
  const cardCount = cards.length;
  const linkCount = connections.length;

  return (
    <div
      ref={containerRef}
      data-canvas-background="true"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      className="canvas-plate"
      style={{
        // Dot lattice matches the snap grid so cards visibly settle
        // onto the dots they snap to.
        backgroundImage: `radial-gradient(rgba(243,239,230,.16) 1px, transparent 1.4px)`,
        backgroundSize: `${CANVAS_GRID * transform.scale}px ${CANVAS_GRID * transform.scale}px`,
        backgroundPosition: `${transform.x}px ${transform.y}px`,
        cursor: isHandMode ? "grab" : "crosshair",
      }}
    >
      {/* Transformed Canvas World */}
      <div
        className="canvas-world"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {/* SVG Connection Vectors */}
        <CanvasConnections
          connections={connections}
          blocks={blocks}
          connectingFromId={connectingFromId}
          onRemoveConnection={removeConnection}
        />

        {/* Node Cards — dividers are document-only furniture and merged
            list runs fold into single cards */}
        {cards.map((card) => (
          <div
            key={card.id}
            className="world-node"
          >
            <CanvasNode
              node={card}
              scale={transform.scale}
              isConnecting={connectingFromId === card.id}
              isHandMode={isHandMode}
              onPositionChange={updateNodePosition}
              onSizeChange={updateNodeSize}
              onDragEnd={recordSnapshotCurrent}
              onResizeEnd={recordSnapshotCurrent}
              onCycleColor={cycleNodeColor}
              onPortClick={handlePortClick}
              onOpenInDocument={onOpenInDocument}
            />
          </div>
        ))}
      </div>

      {/* Floating Right-Side Tool Palette */}
      <div className="tool-pal">
        <div className="tool-group">
          {/* Pointer Mode Button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setTool("pointer")}
            className={`tool-btn${tool === "pointer" ? " on" : ""}`}
            title="Pointer mode (select, move & connect nodes) — Tab to toggle"
            aria-label="Pointer mode"
          >
            <MousePointer2 size={16} />
          </button>

          {/* Hand Mode Button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setTool("hand")}
            className={`tool-btn${tool === "hand" ? " on" : ""}`}
            title="Hand mode (pan view only) — Tab to toggle"
            aria-label="Hand mode"
          >
            <Hand size={16} />
          </button>
        </div>

        {/* Tab Shortcut Tooltip hint */}
        <div className="tool-hint">
          TAB TO SWITCH
        </div>
      </div>

      {/* Empty Canvas Notice */}
      {cardCount === 0 && (
        <div className="canvas-empty">
          <div className="canvas-empty-inner">
            <p className="canvas-empty-kicker">EMPTY CANVAS</p>
            <p className="canvas-empty-copy">
              Toggle back to document view to add blocks, then arrange them here in spatial mode.
            </p>
          </div>
        </div>
      )}

      {/* Bottom-Left Status & Instructions */}
      <div className="canvas-status">
        <i className={isHandMode ? "hand" : ""} aria-hidden="true" />
        <span>
          {`${cardCount} BLOCK${cardCount === 1 ? "" : "S"} · ${linkCount} LINK${linkCount === 1 ? "" : "S"} · `}
          {isHandMode
            ? "HAND VIEW MODE · DRAG ANYWHERE TO PAN · TAB TO SWITCH TO POINTER"
            : "POINTER MODE · DRAG CARDS · DOUBLE-CLICK CARD TO EDIT · TAB TO SWITCH TO HAND"}
        </span>
      </div>

      {/* HUD Controls with Undo / Redo */}
      <CanvasToolbar
        scale={transform.scale}
        saveStatus={saveStatus}
        canUndo={!isHandMode && canUndo}
        canRedo={!isHandMode && canRedo}
        onUndo={undo}
        onRedo={redo}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onFitAll={fitAll}
      />
    </div>
  );
}
