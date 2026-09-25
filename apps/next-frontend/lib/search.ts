import type { SearchResponse, SearchResultItem } from "./types";

/**
 * Segment of text with highlight state for safe React rendering.
 * Avoids any need for dangerouslySetInnerHTML.
 */
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Parses highlighted text containing <em>...</em> or <mark>...</mark>
 * into plain text segments with an isHighlighted flag.
 */
export function parseHighlightSegments(text: string): HighlightSegment[] {
  if (!text) return [];
  const parts = text.split(/(<\/?(?:em|mark)>)/gi);
  const segments: HighlightSegment[] = [];
  let isHighlighted = false;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "<em>" || lower === "<mark>") {
      isHighlighted = true;
      continue;
    }
    if (lower === "</em>" || lower === "</mark>") {
      isHighlighted = false;
      continue;
    }
    if (!part) continue;
    segments.push({ text: part, highlighted: isHighlighted });
  }

  return segments;
}

/**
 * Extracts target block ID from a location hash (e.g., "#block-abc-123" -> "abc-123").
 * Returns null if hash does not match the deep-link block convention.
 */
export function parseBlockIdFromHash(hash: string): string | null {
  if (!hash) return null;
  const decoded = decodeURIComponent(hash);
  const clean = decoded.startsWith("#") ? decoded.slice(1) : decoded;
  if (!clean.startsWith("block-")) return null;
  const blockId = clean.slice("block-".length).trim();
  return blockId.length > 0 ? blockId : null;
}

/**
 * Generates the deep-link route URL for a search result item.
 */
export function getSearchResultUrl(noteId: string, blockId: string | null): string {
  if (blockId) {
    return `/notes/${noteId}#block-${blockId}`;
  }
  return `/notes/${noteId}`;
}

export type { SearchResponse, SearchResultItem };
