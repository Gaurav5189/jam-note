import type { Block, BlockConnection } from "@/lib/types";

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export type CanvasTool = "pointer" | "hand";

// Print-plate inks for card accents (Phase 5.3 desk redesign). Cards
// are paper stock with ink borders; the chosen ink tints the card's
// header strip (the drag handle). Older notes may still store neon
// swatch values — data is preserved.
export const CANVAS_COLORS = [
  { id: "default", label: "Default", color: null },
  { id: "gold", label: "Gold", color: "#ffb511" },
  { id: "red", label: "Red", color: "#ff3d1c" },
  { id: "ink", label: "Ink", color: "#151310" },
] as const;

/** The ink header tint flips to paper text for contrast. */
export const CANVAS_INK_COLOR = "#151310";

export const DEFAULT_NODE_WIDTH = 280;
export const DEFAULT_NODE_HEIGHT = 160;
export const MIN_NODE_WIDTH = 200;
export const MIN_NODE_HEIGHT = 100;
export const MAX_NODE_WIDTH = 800;
export const MAX_NODE_HEIGHT = 800;

/** World-space snap lattice for card drags and resizes (pixels). */
export const CANVAS_GRID = 16;

/** Snap a world-space coordinate/size onto the canvas grid. */
export function snapToGrid(value: number): number {
  return Math.round(value / CANVAS_GRID) * CANVAS_GRID;
}

/**
 * Dividers are document-only furniture (a rule between blocks) — they
 * have no spatial meaning, so they never render as canvas cards. They
 * stay in the persisted blocks array (deleting them from canvas saves
 * would shred the document); every canvas display/computation layer
 * filters with this predicate instead.
 */
export function isCanvasCard(block: Block): boolean {
  return block.type !== "divider";
}

/**
 * Block types that merge into ONE canvas card when written
 * consecutively in document mode — a run of To-Dos / list items is a
 * single list, so on the board it should read as one card, not a pile
 * of sibling cards. Any other block type (or a divider, which renders
 * nothing) breaks the run.
 */
export const CANVAS_GROUP_TYPES: ReadonlySet<string> = new Set(["todo", "list-item"]);

/** A spatial card — one block, or a merged run of list-furniture blocks. */
export interface CanvasCardData {
  /**
   * Anchor id — the FIRST member's block id. The card's geometry,
   * color, ports and connections all key on it, and it is a real
   * block id so double-click-to-document and undo/redo keep working.
   */
  id: string;
  blocks: Block[];
}

/**
 * Fold the persisted blocks into spatial cards: consecutive
 * todo/list-item runs become a single card; every other card-eligible
 * block becomes its own; dividers break runs and yield nothing.
 * Pure — recomputed from state, never persisted as separate entities.
 */
export function groupCanvasBlocks(blocks: Block[]): CanvasCardData[] {
  const cards: CanvasCardData[] = [];
  let run: Block[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    cards.push({ id: run[0].id, blocks: run });
    run = [];
  };
  for (const block of blocks) {
    if (!isCanvasCard(block)) {
      // Divider: document furniture — ends the run, renders nothing.
      flushRun();
      continue;
    }
    if (CANVAS_GROUP_TYPES.has(block.type)) {
      run.push(block);
      continue;
    }
    flushRun();
    cards.push({ id: block.id, blocks: [block] });
  }
  flushRun();
  return cards;
}

/** Map every member block id to its card's anchor id (member→anchor). */
export function canvasAnchorMap(blocks: Block[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const card of groupCanvasBlocks(blocks)) {
    for (const member of card.blocks) map.set(member.id, card.id);
  }
  return map;
}

/**
 * Re-point connection endpoints at card anchors (a legacy connection
 * may reference a block that is now a non-anchor member of a run) and
 * drop pairs that collapse onto the same card. Runs once at canvas
 * mount; new connections are created against anchors directly.
 */
export function anchorConnections(
  connections: BlockConnection[],
  blocks: Block[]
): BlockConnection[] {
  const anchor = canvasAnchorMap(blocks);
  const seen = new Set<string>();
  const next: BlockConnection[] = [];
  for (const conn of connections) {
    const from = anchor.get(conn.from_id) ?? conn.from_id;
    const to = anchor.get(conn.to_id) ?? conn.to_id;
    if (from === to) continue;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(from === conn.from_id && to === conn.to_id ? conn : { ...conn, from_id: from, to_id: to });
  }
  return next;
}
