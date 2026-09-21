"use client";

import { memo, useCallback, useRef } from "react";
import { Edit3, GripHorizontal, Palette } from "lucide-react";
import { BlockContent } from "@/components/block-view";
import { CANVAS_INK_COLOR, DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type CanvasCardData } from "./types";

interface CanvasNodeProps {
  node: CanvasCardData;
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
  node,
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
  // Anchor = first member. For a merged run (consecutive To-Dos /
  // list items) the anchor carries the card's geometry, color, ports
  // and identity; every interaction keys on node.id (the anchor id).
  const anchor = node.blocks[0];
  const meta = anchor.canvas_metadata ?? {
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
        onPositionChange(node.id, dx, dy);
      }
    },
    [node.id, onPositionChange, scale]
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
        onDragEnd?.(node.id);
      }
    },
    [node.id, onDragEnd]
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
      onSizeChange(node.id, resizeStartRef.current.width + dx, resizeStartRef.current.height + dy);
    },
    [node.id, onSizeChange, scale]
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
        onResizeEnd?.(node.id);
      }
    },
    [node.id, onResizeEnd]
  );

  // The chosen ink tints the card's HEADER strip (the drag handle) — far
  // more visible than the old 1.5px border tint. The ink swatch flips
  // its label to paper for contrast; the body below stays paper.
  const headerStyle =
    meta.color
      ? {
          backgroundColor: meta.color,
          color: meta.color === CANVAS_INK_COLOR ? "#f3efe6" : "#151310",
        }
      : undefined;

  // Blank blocks (no text/src) render a muted placeholder instead of a
  // dead empty card — cards are read-only; editing happens in Document
  // view via double-click. A merged run shows content if ANY member
  // has some.
  const hasContent = node.blocks.some(
    (b) => Boolean(b.properties.text?.trim() || b.properties.src)
  );

  return (
    <div
      data-block-id={node.id}
      className={`cn-card${isConnecting ? " is-connecting" : ""}`}
      style={{
        left: `${meta.x}px`,
        top: `${meta.y}px`,
        width: `${meta.width}px`,
        height: `${meta.height}px`,
      }}
    >
      {/* Header / Drag Handle */}
      <div
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
        className="cn-head"
        style={{ cursor: isHandMode ? "default" : "grab", ...headerStyle }}
        title={isHandMode ? undefined : "Drag to move card (or double-click to edit content in Document view)"}
        onDoubleClick={() => onOpenInDocument?.(node.id)}
      >
        <div className="cn-badge">
          <GripHorizontal size={12} style={{ opacity: isHandMode ? 0.3 : 0.6 }} />
          <span>{node.blocks.length > 1 ? `${anchor.type} ×${node.blocks.length}` : anchor.type}</span>
        </div>

        <div className="cn-btns">
          {/* Color Switcher Button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCycleColor(node.id);
            }}
            className="cn-btn"
            title="Change card color (cycles 4 inks)"
            aria-label="Change node color"
          >
            <span
              className="cn-dot"
              style={{ backgroundColor: meta.color || "rgba(21,19,16,.35)" }}
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
                onOpenInDocument(node.id);
              }}
              className="cn-btn edit"
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
        onDoubleClick={() => onOpenInDocument?.(node.id)}
        className="cn-body-el"
        title="Double-click to edit content in Document view"
      >
        {node.blocks.length > 1 ? (
          // Merged run: every member renders, stacked as one list.
          node.blocks.map((member) => <BlockContent key={member.id} block={member} />)
        ) : hasContent ? (
          <BlockContent block={anchor} />
        ) : (
          <p className="cn-empty">
            EMPTY {anchor.type.replace("header-", "HEADING ").toUpperCase()} — DOUBLE-CLICK TO EDIT IN DOCUMENT VIEW
          </p>
        )}
      </div>

      {/* Connection Ports: Left & Right (hidden in Hand mode) */}
      {!isHandMode && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPortClick(node.id);
            }}
            className={`cn-port cn-port-l${isConnecting ? " is-connecting" : ""}`}
            title={isConnecting ? "Cancel connection" : "Connect node"}
            aria-label="Connect node port"
          >
            <i />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPortClick(node.id);
            }}
            className={`cn-port cn-port-r${isConnecting ? " is-connecting" : ""}`}
            title={isConnecting ? "Cancel connection" : "Connect node"}
            aria-label="Connect node port"
          >
            <i />
          </button>

          {/* Resize Handle (Bottom-Right) */}
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            className="cn-resize"
            title="Resize node"
          >
            <i />
          </div>
        </>
      )}
    </div>
  );
}

export const CanvasNode = memo(CanvasNodeImpl);
