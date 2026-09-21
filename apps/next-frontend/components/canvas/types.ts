import type { Block } from "@/lib/types";

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
