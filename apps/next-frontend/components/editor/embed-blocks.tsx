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
      <div className="embed-edit">
        <Link2 size={13} />
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
          className="embed-input"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commitUrl}
          className="embed-btn"
        >
          SET
        </button>
        {src && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="embed-btn ghost"
          >
            CANCEL
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="embed-frame">
      {/* eslint-disable-next-line @next/next/no-img-element -- user asset URLs come from arbitrary hosts, not the Next image pipeline */}
      <img
        src={src ?? undefined}
        alt={block.properties.text || "Image block"}
      />
      <div className="embed-actions">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(true)}
          className="embed-act"
          title="Replace image"
          aria-label="Replace image"
        >
          <Link2 size={12} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRemove(block.id)}
          className="embed-act danger"
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
    <div className="embed-rule">
      <i role="separator" aria-hidden="true" />
      <button
        type="button"
        // Keep the caret wherever it was — clicking a control must never
        // steal focus from the block the user is writing in.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onRemove(block.id)}
        className="embed-act danger"
        title="Delete divider"
        aria-label="Delete divider block"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
});

// ─── Drawing block (canvas sketch pad → PNG dataURL) ─────────────────────

// Print inks on the paper sketch pad: process black, Riso Red, Flat
// Gold, and a graphite pencil tone.
const STROKE_COLORS = ["#151310", "#ff3d1c", "#ffb511", "#8A94A6"] as const;

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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (src) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = src;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
    ctx.lineWidth = 2.5;
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
    if (data) {
      onProperties(block.id, { src: data });
    }
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onProperties(block.id, { src: null });
  };

  return (
    <div className="draw-frame">
      <div className="draw-toolbar">
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
            className={`draw-dot${color === c ? " on" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}

        <span style={{ flex: 1 }} />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearDrawing}
          className="draw-btn"
        >
          CLEAR
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRemove(block.id)}
          className="draw-btn danger"
          title="Delete block"
          aria-label="Delete drawing block"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={320}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="draw-canvas"
        aria-label="Drawing canvas"
      />
    </div>
  );
});
