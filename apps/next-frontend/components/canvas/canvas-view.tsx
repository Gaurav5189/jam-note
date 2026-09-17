"use client";

import { useCallback, useEffect, useRef } from "react";
import { Hand, MousePointer2 } from "lucide-react";
import type { Block, BlockConnection } from "@/lib/types";
import { useCanvasState } from "./use-canvas-state";
import { CanvasNode } from "./canvas-node";
import { CanvasConnections } from "./canvas-connections";
import { CanvasToolbar } from "./canvas-toolbar";

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
      className={`relative w-full h-[calc(100vh-140px)] min-h-[520px] overflow-hidden bg-background-base select-none border border-border-thin rounded-md focus:outline-none ${
        isHandMode
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-crosshair"
      }`}
      style={{
        backgroundImage: `radial-gradient(#2A2F3D 1px, transparent 1px)`,
        backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
        backgroundPosition: `${transform.x}px ${transform.y}px`,
      }}
    >
      {/* Transformed Canvas World */}
      <div
        className="absolute inset-0 pointer-events-none"
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

        {/* Node Cards */}
        {blocks.map((block) => (
          <div
            key={block.id}
            className="pointer-events-auto"
          >
            <CanvasNode
              block={block}
              scale={transform.scale}
              isConnecting={connectingFromId === block.id}
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

      {/* Floating Right-Side Tool Palette (Reference Image 2) */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center select-none pointer-events-auto">
        <div className="bg-background-panel/95 border border-border-thin rounded-full p-1 flex flex-col items-center gap-1 shadow-xl backdrop-blur-sm">
          {/* Pointer Mode Button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setTool("pointer")}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              tool === "pointer"
                ? "bg-text-primary text-background-base shadow-sm"
                : "text-text-muted hover:text-text-primary hover:bg-background-steel"
            }`}
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
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              tool === "hand"
                ? "bg-text-primary text-background-base shadow-sm"
                : "text-text-muted hover:text-text-primary hover:bg-background-steel"
            }`}
            title="Hand mode (pan view only) — Tab to toggle"
            aria-label="Hand mode"
          >
            <Hand size={16} />
          </button>
        </div>

        {/* Tab Shortcut Tooltip hint */}
        <div className="mt-2 px-2 py-0.5 rounded-sm bg-background-panel/80 border border-border-thin text-[9px] font-mono uppercase tracking-wider text-text-muted/70 text-center whitespace-nowrap shadow-sm">
          Tab to switch
        </div>
      </div>

      {/* Empty Canvas Notice */}
      {blocks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="p-6 rounded-md bg-background-panel/90 border border-border-thin text-center max-w-sm shadow-xl">
            <p className="text-xs font-mono uppercase tracking-widest text-accent-neon">
              Empty Canvas
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Toggle back to document view to add blocks, then arrange them here in spatial mode.
            </p>
          </div>
        </div>
      )}

      {/* Bottom-Left Status & Instructions */}
      <div className="absolute bottom-6 left-6 z-20 pointer-events-none select-none">
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted/70 bg-background-panel/85 border border-border-thin rounded-sm px-2.5 py-1 backdrop-blur-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isHandMode ? "bg-accent-amber" : "bg-accent-neon animate-pulse"
            }`}
          />
          <span>
            {isHandMode
              ? "HAND VIEW MODE · DRAG ANYWHERE TO PAN · TAB TO SWITCH TO POINTER"
              : "POINTER MODE · DRAG CARDS · DOUBLE-CLICK CARD TO EDIT · TAB TO SWITCH TO HAND"}
          </span>
        </div>
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
