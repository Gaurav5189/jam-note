"use client";

import { memo, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Block, BlockConnection } from "@/lib/types";

interface CanvasConnectionsProps {
  connections: BlockConnection[];
  blocks: Block[];
  connectingFromId: string | null;
  onRemoveConnection: (from_id: string, to_id: string) => void;
}

interface ConnectionLine {
  from_id: string;
  to_id: string;
  path: string;
  midX: number;
  midY: number;
  color: string;
}

function CanvasConnectionsImpl({
  connections,
  blocks,
  connectingFromId,
  onRemoveConnection,
}: CanvasConnectionsProps) {
  const [hoveredConn, setHoveredConn] = useState<string | null>(null);

  const blockMap = useMemo(() => {
    const map = new Map<string, Block>();
    for (const b of blocks) {
      map.set(b.id, b);
    }
    return map;
  }, [blocks]);

  const lines = useMemo<ConnectionLine[]>(() => {
    const result: ConnectionLine[] = [];

    for (const conn of connections) {
      const from = blockMap.get(conn.from_id);
      const to = blockMap.get(conn.to_id);
      if (!from?.canvas_metadata || !to?.canvas_metadata) continue;

      const f = from.canvas_metadata;
      const t = to.canvas_metadata;

      // Determine anchor positions based on relative horizontal placement
      let startX: number;
      let startY = f.y + f.height / 2;
      let endX: number;
      let endY = t.y + t.height / 2;

      if (f.x + f.width < t.x) {
        // From is to the left of To
        startX = f.x + f.width;
        endX = t.x;
      } else if (t.x + t.width < f.x) {
        // From is to the right of To
        startX = f.x;
        endX = t.x + t.width;
      } else {
        // Overlapping horizontally: connect centers
        startX = f.x + f.width / 2;
        startY = f.y + f.height;
        endX = t.x + t.width / 2;
        endY = t.y;
      }

      const dx = Math.abs(endX - startX);
      const controlOffset = Math.max(dx * 0.5, 40);

      const cx1 = startX < endX ? startX + controlOffset : startX - controlOffset;
      const cy1 = startY;
      const cx2 = startX < endX ? endX - controlOffset : endX + controlOffset;
      const cy2 = endY;

      const path = `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;

      result.push({
        from_id: conn.from_id,
        to_id: conn.to_id,
        path,
        midX,
        midY,
        color: conn.color ?? "#D1FF4D",
      });
    }

    return result;
  }, [connections, blockMap]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <svg className="w-full h-full overflow-visible">
        <defs>
          <marker
            id="canvas-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#D1FF4D" />
          </marker>
        </defs>

        {lines.map((line) => {
          const key = `${line.from_id}-${line.to_id}`;
          const isHovered = hoveredConn === key;

          return (
            <g key={key}>
              {/* Invisible wider hit-target for easier hovering */}
              <path
                d={line.path}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredConn(key)}
                onMouseLeave={() => setHoveredConn(null)}
              />

              {/* Visible SVG connection vector */}
              <path
                d={line.path}
                fill="none"
                stroke={line.color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeDasharray={isHovered ? "4 2" : undefined}
                className="transition-all opacity-80"
              />

              {/* Endpoint circles */}
              <circle
                cx={line.midX}
                cy={line.midY}
                r={isHovered ? 10 : 3}
                fill={isHovered ? "#FF5533" : line.color}
                className="pointer-events-auto cursor-pointer transition-all"
                onMouseEnter={() => setHoveredConn(key)}
                onMouseLeave={() => setHoveredConn(null)}
                onClick={() => onRemoveConnection(line.from_id, line.to_id)}
              >
                <title>Click to remove connection</title>
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Delete connection badge on hover */}
      {hoveredConn && (
        <div
          className="absolute z-20 pointer-events-auto"
          style={{
            left: `${lines.find((l) => `${l.from_id}-${l.to_id}` === hoveredConn)?.midX ?? 0}px`,
            top: `${lines.find((l) => `${l.from_id}-${l.to_id}` === hoveredConn)?.midY ?? 0}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              const parts = hoveredConn.split("-");
              onRemoveConnection(parts[0], parts[1]);
              setHoveredConn(null);
            }}
            className="p-1 rounded-full bg-background-panel border border-accent-amber text-accent-amber hover:bg-accent-amber hover:text-background-base transition-colors shadow-sm"
            title="Delete connection"
            aria-label="Delete connection"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {connectingFromId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm bg-background-panel border border-accent-neon text-[11px] font-mono uppercase tracking-wider text-accent-neon shadow-lg z-50 pointer-events-auto">
          ◈ Select target node to connect (or click dot again to cancel)
        </div>
      )}
    </div>
  );
}

export const CanvasConnections = memo(CanvasConnectionsImpl);
