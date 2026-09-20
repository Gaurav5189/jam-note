export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export type CanvasTool = "pointer" | "hand";

// Print-plate inks for card accents (Phase 5.3 desk redesign). Cards
// are paper stock with ink borders; the chosen ink tints the border.
// Older notes may still store neon swatch values — data is preserved.
export const CANVAS_COLORS = [
  { id: "default", label: "Default", color: null, borderClass: "" },
  { id: "gold", label: "Gold", color: "#ffb511", borderClass: "" },
  { id: "red", label: "Red", color: "#ff3d1c", borderClass: "" },
  { id: "ink", label: "Ink", color: "#151310", borderClass: "" },
] as const;

export const DEFAULT_NODE_WIDTH = 280;
export const DEFAULT_NODE_HEIGHT = 160;
export const MIN_NODE_WIDTH = 200;
export const MIN_NODE_HEIGHT = 100;
export const MAX_NODE_WIDTH = 800;
export const MAX_NODE_HEIGHT = 800;
