"use client";

import { memo, useCallback, useRef } from "react";
import { Edit3, GripHorizontal, Palette } from "lucide-react";
import type { Block } from "@/lib/types";
import { BlockContent } from "@/components/block-view";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "./types";

interface CanvasNodeProps {
  block: Block;
  scale: number;
  isConnecting: boolean;
  isHandMode?: boolean;
  onPositionChange: (blockId: string, dx: number, dy: number) => void;
  onSizeChange: (blockId: string, width: number, height: number) => void;
  onDragEnd?: (blockId: string) => void;
  onResizeEnd?: (blockId: string) => void;
  onCycleColor: (blockId: string) => void;
  onPortClick: (blockId: string) => void;
  onOpenInDocument?: (blockId: string) => void;
}

function CanvasNodeImpl({
  block,
  scale,
  isConnecting,
  isHandMode = false,
  onPositionChange,
  onSizeChange,
  onDragEnd,
  onResizeEnd,
  onCycleColor,
  onPortClick,
  onOpenInDocument,
}: CanvasNodeProps) {
  const meta = block.canvas_metadata ?? {
    x: 0,
    y: 0,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    color: null,
  };

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // ─── Drag handling ──────────────────────────────────────────────────────

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only primary mouse button and not in hand mode
      if (isHandMode || e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [isHandMode]
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const dx = (e.clientX - dragStartRef.current.x) / scale;
      const dy = (e.clientY - dragStartRef.current.y) / scale;
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        onPositionChange(block.id, dx, dy);
      }
    },
    [block.id, onPositionChange, scale]
  );

  const handleDragPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // pointer capture might already be released
        }
        onDragEnd?.(block.id);
      }
    },
    [block.id, onDragEnd]
  );

  // ─── Resize handling ────────────────────────────────────────────────────

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isHandMode || e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isResizingRef.current = true;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: meta.width,
        height: meta.height,
      };
    },
    [isHandMode, meta.height, meta.width]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizingRef.current) return;
      const dx = (e.clientX - resizeStartRef.current.x) / scale;
      const dy = (e.clientY - resizeStartRef.current.y) / scale;
      onSizeChange(block.id, resizeStartRef.current.width + dx, resizeStartRef.current.height + dy);
    },
    [block.id, onSizeChange, scale]
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // pointer capture might already be released
        }
        onResizeEnd?.(block.id);
      }
    },
    [block.id, onResizeEnd]
  );

  const borderColor = meta.color || "var(--color-border-thin)";

  return (
    <div
      data-block-id={block.id}
      className={`group absolute rounded-sm bg-background-panel border flex flex-col select-none shadow-md transition-shadow ${
        isConnecting ? "ring-2 ring-accent-neon" : ""
      }`}
      style={{
        left: `${meta.x}px`,
        top: `${meta.y}px`,
        width: `${meta.width}px`,
        height: `${meta.height}px`,
        borderColor: borderColor,
      }}
    >
      {/* Header / Drag Handle */}
      <div
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
        className={`h-7 px-2 border-b border-border-thin bg-background-steel/60 flex items-center justify-between shrink-0 ${
          isHandMode ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        }`}
        title={isHandMode ? undefined : "Drag to move card (or double-click to edit content in Document view)"}
        onDoubleClick={() => onOpenInDocument?.(block.id)}
      >
        <div className="flex items-center gap-1.5 text-text-muted">
          <GripHorizontal size={12} className={isHandMode ? "opacity-30" : "opacity-60 group-hover:opacity-100"} />
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted">
            {block.type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Color Switcher Button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCycleColor(block.id);
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 hover:text-text-primary text-text-muted hover:bg-background-panel transition-colors rounded-xs border border-border-thin/70 cursor-pointer"
            title="Change card color (cycles 4 colors)"
            aria-label="Change node color"
          >
            <span
              className="w-2.5 h-2.5 rounded-full border border-border-thin shrink-0 transition-colors"
              style={{ backgroundColor: meta.color || "#8A94A6" }}
            />
            <Palette size={10} />
          </button>

          {/* Edit in Document View Button */}
          {onOpenInDocument && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInDocument(block.id);
              }}
              className="p-1 hover:text-accent-neon text-text-muted transition-colors rounded-xs border border-border-thin/70 cursor-pointer"
              title="Edit text in Document view"
              aria-label="Edit in Document"
            >
              <Edit3 size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Card Content Area */}
      <div
        data-canvas-scrollable="true"
        onDoubleClick={() => onOpenInDocument?.(block.id)}
        className="p-3 overflow-y-auto flex-1 pointer-events-auto text-[13px] leading-relaxed cursor-default scrollbar-thin"
        title="Double-click to edit content in Document view"
      >
        <BlockContent block={block} />
      </div>

      {/* Connection Ports: Left & Right (hidden in Hand mode) */}
      {!isHandMode && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPortClick(block.id);
            }}
            className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-border-thin bg-background-panel flex items-center justify-center transition-all ${
              isConnecting
                ? "scale-125 border-accent-neon bg-accent-neon text-background-base"
                : "opacity-0 group-hover:opacity-100 hover:border-accent-neon hover:scale-110"
            }`}
            title={isConnecting ? "Cancel connection" : "Connect node"}
            aria-label="Connect node port"
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isConnecting ? "bg-background-base" : "bg-accent-neon"
              }`}
            />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPortClick(block.id);
            }}
            className={`absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-border-thin bg-background-panel flex items-center justify-center transition-all ${
              isConnecting
                ? "scale-125 border-accent-neon bg-accent-neon text-background-base"
                : "opacity-0 group-hover:opacity-100 hover:border-accent-neon hover:scale-110"
            }`}
            title={isConnecting ? "Cancel connection" : "Connect node"}
            aria-label="Connect node port"
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isConnecting ? "bg-background-base" : "bg-accent-neon"
              }`}
            />
          </button>

          {/* Resize Handle (Bottom-Right) */}
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 flex items-center justify-center"
            title="Resize node"
          >
            <div className="w-1.5 h-1.5 border-r border-b border-text-muted hover:border-accent-neon" />
          </div>
        </>
      )}
    </div>
  );
}

export const CanvasNode = memo(CanvasNodeImpl);
