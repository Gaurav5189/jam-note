export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export type CanvasTool = "pointer" | "hand";

export const CANVAS_COLORS = [
  { id: "default", label: "Default", color: null, borderClass: "border-border-thin" },
  { id: "neon", label: "Neon", color: "#D1FF4D", borderClass: "border-accent-neon" },
  { id: "amber", label: "Amber", color: "#FFB800", borderClass: "border-accent-amber" },
  { id: "cyan", label: "Cyan", color: "#38BDF8", borderClass: "border-[#38BDF8]" },
] as const;

export const DEFAULT_NODE_WIDTH = 280;
export const DEFAULT_NODE_HEIGHT = 160;
export const MIN_NODE_WIDTH = 200;
export const MIN_NODE_HEIGHT = 100;
export const MAX_NODE_WIDTH = 800;
export const MAX_NODE_HEIGHT = 800;
