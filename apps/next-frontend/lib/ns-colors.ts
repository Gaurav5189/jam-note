// ─── Sidebar color coding (Phase 6) ────────────────────────────────────────
//
// Folders and notes can carry a pastel accent, stored as a palette KEY
// (validated by the backend against the same list — see
// fastapi_backend/notes/models.py#PALETTE_COLORS) and resolved to a hex
// hue only here, on the client. Keys must stay in sync across both apps.

/** Palette key → pastel hue shown on the dark plate. */
export const NS_COLORS: Record<string, string> = {
  amber: "#f5c97b",
  rose: "#f2a2b0",
  mint: "#9fd8b4",
  sky: "#9ec9f0",
  violet: "#c3aef2",
  lime: "#cfe59a",
  peach: "#f5c8a0",
  steel: "#a8b3bd",
};

/** Ordered key list for rendering the swatch picker. */
export const NS_COLOR_KEYS = Object.keys(NS_COLORS);
