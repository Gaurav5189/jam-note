"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import type { Block, BlockProperties } from "@/lib/types";

// ─── Image block (URL embed — file uploads arrive with S3/MinIO) ────────

export const ImageBlock = memo(function ImageBlock({
  block,
  onProperties,
  onRemove,
}: {
  block: Block;
  onProperties: (blockId: string, patch: Partial<BlockProperties>) => void;
  onRemove: (blockId: string) => void;
}) {
  const src = block.properties.src ?? null;
  const [editing, setEditing] = useState(!src);
  const [url, setUrl] = useState(src ?? "");

  const commitUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setEditing(false);
    onProperties(block.id, { src: trimmed });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 border border-dashed border-border-thin rounded-sm my-2 p-2">
        <Link2 size={13} className="text-text-muted shrink-0" />
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitUrl();
            if (e.key === "Escape" && src) setEditing(false);
          }}
          placeholder="Paste image URL…"
          aria-label="Image URL"
          className="flex-1 bg-transparent text-[13px] font-mono text-text-primary placeholder:text-text-muted/60 focus:outline-none"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commitUrl}
          className="text-[10px] font-mono uppercase tracking-wider text-accent-neon border border-accent-neon/40 hover:border-accent-neon rounded-sm px-2 py-1 transition-colors"
        >
          Set
        </button>
        {src && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary px-1"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group/img relative my-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- user asset URLs come from arbitrary hosts, not the Next image pipeline */}
      <img
        src={src ?? undefined}
        alt={block.properties.text || "Image block"}
        className="max-w-full border border-border-thin rounded-sm block"
      />
      <div className="absolute top-2 right-2 hidden group-hover/img:flex gap-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(true)}
          className="bg-background-panel/90 border border-border-thin rounded-sm p-1.5 text-text-muted hover:text-accent-neon transition-colors"
          title="Replace image"
          aria-label="Replace image"
        >
          <Link2 size={12} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRemove(block.id)}
          className="bg-background-panel/90 border border-border-thin rounded-sm p-1.5 text-text-muted hover:text-accent-amber transition-colors"
          title="Delete block"
          aria-label="Delete image block"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
});

// ─── Divider block (horizontal rule) ─────────────────────────────────────

/**
 * A horizontal rule inserted via the `/line break` command. Render-only
 * (no textarea), removed through its hover control like the other embeds.
 */
export const DividerBlock = memo(function DividerBlock({
  block,
  onRemove,
}: {
  block: Block;
  onRemove: (blockId: string) => void;
}) {
  return (
    <div className="group/div relative my-3">
      <div className="h-px w-full bg-border-thin" role="separator" />
      <button
        type="button"
        // Keep the caret wherever it was — clicking a control must never
        // steal focus from the block the user is writing in.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onRemove(block.id)}
        className="absolute -top-2.5 right-0 hidden group-hover/div:flex bg-background-panel/90 border border-border-thin rounded-sm p-1.5 text-text-muted hover:text-accent-amber transition-colors"
        title="Delete divider"
        aria-label="Delete divider block"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
});

// ─── Drawing block (canvas sketch pad → PNG dataURL) ─────────────────────

const STROKE_COLORS = ["#D1FF4D", "#FFB800", "#F3F4F6", "#8A94A6"] as const;

export const DrawingBlock = memo(function DrawingBlock({
  block,
  onProperties,
  onRemove,
}: {
  block: Block;
  onProperties: (blockId: string, patch: Partial<BlockProperties>) => void;
  onRemove: (blockId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const colorRef = useRef<string>(STROKE_COLORS[0]);
  const [color, setColor] = useState<string>(STROKE_COLORS[0]);

  // Redraw a previously saved drawing so editing continues where it left off.
  useEffect(() => {
    const src = block.properties.src;
    const canvas = canvasRef.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = src;
  }, [block.properties.src]);

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = toCanvasPoint(event);
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const last = lastPointRef.current;
    if (!ctx || !last) return;
    const point = toCanvasPoint(event);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const data = canvasRef.current?.toDataURL("image/png");
    if (data) onProperties(block.id, { src: data });
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onProperties(block.id, { src: null });
  };

  return (
    <div className="my-2 border border-border-thin rounded-sm overflow-hidden bg-background-panel">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-thin">
        {STROKE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              colorRef.current = c;
              setColor(c);
            }}
            aria-label={`Stroke color ${c}`}
            aria-pressed={color === c}
            className={`w-3.5 h-3.5 rounded-full border transition-colors ${
              color === c ? "border-accent-neon" : "border-border-thin"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearDrawing}
          className="text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
        >
          Clear
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRemove(block.id)}
          className="text-text-muted hover:text-accent-amber transition-colors"
          title="Delete block"
          aria-label="Delete drawing block"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={480}
        height={280}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="block w-full max-w-[480px] cursor-crosshair touch-none bg-background-base"
        aria-label="Drawing canvas"
      />
    </div>
  );
});
