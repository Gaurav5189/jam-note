"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotes } from "@/context/notes-context";
import type { Block, BlockConnection } from "@/lib/types";
import {
  CANVAS_COLORS,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  MAX_NODE_HEIGHT,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  type CanvasTool,
  type CanvasTransform,
} from "./types";

// 2 seconds debounce delay after an edit in canvas mode as requested
const SAVE_DEBOUNCE_MS = 2000;

interface HistorySnapshot {
  blocks: Block[];
  connections: BlockConnection[];
}

function ensureCanvasMetadata(blocks: Block[]): Block[] {
  let changed = false;
  const next = blocks.map((b, index) => {
    const meta = b.canvas_metadata;
    if (
      meta &&
      typeof meta.x === "number" &&
      typeof meta.y === "number" &&
      meta.width > 0 &&
      meta.height > 0
    ) {
      return b;
    }
    changed = true;
    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      ...b,
      canvas_metadata: {
        x: 80 + col * (DEFAULT_NODE_WIDTH + 40),
        y: 60 + row * (DEFAULT_NODE_HEIGHT + 40),
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        color: meta?.color ?? null,
      },
    };
  });
  return changed ? next : blocks;
}

export function useCanvasState({
  noteId,
  initialBlocks,
  initialConnections = [],
  onChange,
}: {
  noteId: string;
  initialBlocks: Block[];
  initialConnections?: BlockConnection[];
  onChange?: (blocks: Block[], connections: BlockConnection[]) => void;
}) {
  const { saveCanvas } = useNotes();

  const [blocks, setBlocks] = useState<Block[]>(() => ensureCanvasMetadata(initialBlocks));
  const [connections, setConnections] = useState<BlockConnection[]>(initialConnections);
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<CanvasTool>("pointer");
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Undo / Redo history
  const [history, setHistory] = useState<HistorySnapshot[]>([
    { blocks: ensureCanvasMetadata(initialBlocks), connections: initialConnections },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Authoritative refs
  const blocksRef = useRef<Block[]>(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const connectionsRef = useRef<BlockConnection[]>(connections);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  const transformRef = useRef<CanvasTransform>(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const toolRef = useRef<CanvasTool>(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const historyRef = useRef<HistorySnapshot[]>(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const historyIndexRef = useRef(historyIndex);
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Autosave pipeline ──────────────────────────────────────────────────

  const flushSave = useCallback(
    async (options?: { keepalive?: boolean }) => {
      if (!isDirtyRef.current) return;
      isDirtyRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setSaveStatus("saving");
      try {
        await saveCanvas(
          noteId,
          {
            blocks: blocksRef.current,
            block_connections: connectionsRef.current,
          },
          options
        );
        setSaveStatus("saved");
      } catch {
        isDirtyRef.current = true;
        setSaveStatus("error");
      }
    },
    [noteId, saveCanvas]
  );

  const notifyChange = useCallback(() => {
    isDirtyRef.current = true;
    setSaveStatus("idle");
    onChangeRef.current?.(blocksRef.current, connectionsRef.current);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // Flush pending changes on unmount or pagehide
  useEffect(() => {
    const handlePageHide = () => {
      if (isDirtyRef.current) {
        flushSave({ keepalive: true });
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (isDirtyRef.current) {
        flushSave({ keepalive: true });
      }
    };
  }, [flushSave]);

  // ─── Undo / Redo ─────────────────────────────────────────────────────────

  const recordSnapshot = useCallback((newBlocks: Block[], newConns: BlockConnection[]) => {
    const currentIdx = historyIndexRef.current;
    const trimmed = historyRef.current.slice(0, currentIdx + 1);
    const updated = [...trimmed, { blocks: newBlocks, connections: newConns }].slice(-30);
    setHistory(updated);
    setHistoryIndex(updated.length - 1);
  }, []);

  const undo = useCallback(() => {
    const currentIdx = historyIndexRef.current;
    if (currentIdx <= 0) return;
    const prevIdx = currentIdx - 1;
    const snapshot = historyRef.current[prevIdx];
    if (!snapshot) return;

    setHistoryIndex(prevIdx);
    blocksRef.current = snapshot.blocks;
    connectionsRef.current = snapshot.connections;
    setBlocks(snapshot.blocks);
    setConnections(snapshot.connections);
    onChangeRef.current?.(snapshot.blocks, snapshot.connections);
    notifyChange();
  }, [notifyChange]);

  const redo = useCallback(() => {
    const currentIdx = historyIndexRef.current;
    if (currentIdx >= historyRef.current.length - 1) return;
    const nextIdx = currentIdx + 1;
    const snapshot = historyRef.current[nextIdx];
    if (!snapshot) return;

    setHistoryIndex(nextIdx);
    blocksRef.current = snapshot.blocks;
    connectionsRef.current = snapshot.connections;
    setBlocks(snapshot.blocks);
    setConnections(snapshot.connections);
    onChangeRef.current?.(snapshot.blocks, snapshot.connections);
    notifyChange();
  }, [notifyChange]);

  // ─── Node transformations ───────────────────────────────────────────────

  const updateNodePosition = useCallback(
    (blockId: string, dx: number, dy: number) => {
      setBlocks((prev) => {
        const next = prev.map((b) => {
          if (b.id !== blockId) return b;
          const meta = b.canvas_metadata ?? {
            x: 0,
            y: 0,
            width: DEFAULT_NODE_WIDTH,
            height: DEFAULT_NODE_HEIGHT,
            color: null,
          };
          return {
            ...b,
            canvas_metadata: {
              ...meta,
              x: Math.round(meta.x + dx),
              y: Math.round(meta.y + dy),
            },
          };
        });
        blocksRef.current = next;
        return next;
      });
      notifyChange();
    },
    [notifyChange]
  );

  const updateNodeSize = useCallback(
    (blockId: string, width: number, height: number) => {
      const clampedW = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, Math.round(width)));
      const clampedH = Math.max(MIN_NODE_HEIGHT, Math.min(MAX_NODE_HEIGHT, Math.round(height)));

      setBlocks((prev) => {
        const next = prev.map((b) => {
          if (b.id !== blockId) return b;
          const meta = b.canvas_metadata ?? {
            x: 0,
            y: 0,
            width: DEFAULT_NODE_WIDTH,
            height: DEFAULT_NODE_HEIGHT,
            color: null,
          };
          return {
            ...b,
            canvas_metadata: {
              ...meta,
              width: clampedW,
              height: clampedH,
            },
          };
        });
        blocksRef.current = next;
        return next;
      });
      notifyChange();
    },
    [notifyChange]
  );

  const cycleNodeColor = useCallback(
    (blockId: string) => {
      setBlocks((prev) => {
        const next = prev.map((b) => {
          if (b.id !== blockId) return b;
          const currentColor = b.canvas_metadata?.color ?? null;
          const currentIndex = CANVAS_COLORS.findIndex((c) => c.color === currentColor);
          const nextIndex = (currentIndex + 1) % CANVAS_COLORS.length;
          const nextColor = CANVAS_COLORS[nextIndex].color;
          const meta = b.canvas_metadata ?? {
            x: 0,
            y: 0,
            width: DEFAULT_NODE_WIDTH,
            height: DEFAULT_NODE_HEIGHT,
            color: null,
          };
          return {
            ...b,
            canvas_metadata: {
              ...meta,
              color: nextColor,
            },
          };
        });
        blocksRef.current = next;
        recordSnapshot(next, connectionsRef.current);
        return next;
      });
      notifyChange();
    },
    [notifyChange, recordSnapshot]
  );

  const recordSnapshotCurrent = useCallback(() => {
    recordSnapshot(blocksRef.current, connectionsRef.current);
  }, [recordSnapshot]);

  // ─── Connection handling ────────────────────────────────────────────────

  const addConnection = useCallback(
    (from_id: string, to_id: string, color?: string | null) => {
      if (from_id === to_id) return;
      const exists = connectionsRef.current.some(
        (c) =>
          (c.from_id === from_id && c.to_id === to_id) ||
          (c.from_id === to_id && c.to_id === from_id)
      );
      if (exists) return;

      const next = [...connectionsRef.current, { from_id, to_id, color: color ?? null }];
      connectionsRef.current = next;
      setConnections(next);
      recordSnapshot(blocksRef.current, next);
      notifyChange();
    },
    [notifyChange, recordSnapshot]
  );

  const removeConnection = useCallback(
    (from_id: string, to_id: string) => {
      const next = connectionsRef.current.filter(
        (c) =>
          !(
            (c.from_id === from_id && c.to_id === to_id) ||
            (c.from_id === to_id && c.to_id === from_id)
          )
      );
      connectionsRef.current = next;
      setConnections(next);
      recordSnapshot(blocksRef.current, next);
      notifyChange();
    },
    [notifyChange, recordSnapshot]
  );

  const handlePortClick = useCallback(
    (blockId: string) => {
      if (connectingFromId === null) {
        setConnectingFromId(blockId);
      } else if (connectingFromId === blockId) {
        setConnectingFromId(null);
      } else {
        addConnection(connectingFromId, blockId);
        setConnectingFromId(null);
      }
    },
    [connectingFromId, addConnection]
  );

  const cancelConnecting = useCallback(() => {
    setConnectingFromId(null);
  }, []);

  // ─── Tool toggle (pointer / hand) ────────────────────────────────────────

  const toggleTool = useCallback(() => {
    setTool((prev) => (prev === "pointer" ? "hand" : "pointer"));
  }, []);

  // ─── Zoom & Pan ─────────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    setTransform((t) => ({ ...t, scale: Math.min(2.5, +(t.scale * 1.2).toFixed(2)) }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((t) => ({ ...t, scale: Math.max(0.25, +(t.scale / 1.2).toFixed(2)) }));
  }, []);

  const resetZoom = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  const fitAll = useCallback(() => {
    if (blocksRef.current.length === 0) {
      setTransform({ x: 0, y: 0, scale: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const b of blocksRef.current) {
      const m = b.canvas_metadata ?? {
        x: 0,
        y: 0,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      };
      minX = Math.min(minX, m.x);
      minY = Math.min(minY, m.y);
      maxX = Math.max(maxX, m.x + m.width);
      maxY = Math.max(maxY, m.y + m.height);
    }

    const padding = 100;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;

    const viewportW = window.innerWidth - 300;
    const viewportH = window.innerHeight - 150;

    const scaleX = viewportW / contentW;
    const scaleY = viewportH / contentH;
    const newScale = Math.max(0.3, Math.min(1.2, Math.min(scaleX, scaleY)));

    const newX = -minX * newScale + (viewportW - (maxX - minX) * newScale) / 2;
    const newY = -minY * newScale + (viewportH - (maxY - minY) * newScale) / 2;

    setTransform({ x: Math.round(newX), y: Math.round(newY), scale: +newScale.toFixed(2) });
  }, []);

  return {
    blocks,
    connections,
    transform,
    setTransform,
    tool,
    setTool,
    toggleTool,
    connectingFromId,
    saveStatus,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    recordSnapshotCurrent,
    updateNodePosition,
    updateNodeSize,
    cycleNodeColor,
    addConnection,
    removeConnection,
    handlePortClick,
    cancelConnecting,
    zoomIn,
    zoomOut,
    resetZoom,
    fitAll,
    flushSave,
  };
}
