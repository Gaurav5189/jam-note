import type { Block } from "@/lib/types";

// ─── Draft mirror (localStorage recovery layer) ───────────────────────────
//
// The autosave pipeline flushes on tab hide, page unload (keepalive) and
// editor unmount — but a hard crash, a reload that outraces the unload
// request, the browser skipping unload handlers, or the 64KB keepalive
// body cap can still lose whatever has not been PUT yet.
//
// The mirror closes that gap: while a note is dirty its live blocks are
// (debounced) written to localStorage, and the next mount restores an
// existing mirror and re-marks the document dirty — the ordinary autosave
// pipeline then pushes it to the server within seconds. localStorage
// survives hard refreshes and browser restarts, so this covers every
// case the unload flushes can miss. The mirror is deleted as soon as a
// save reaches the server, so "a mirror exists" always means "there were
// unsaved edits".

const KEY_PREFIX = "jamnote:draft:";

function mirrorKey(noteId: string): string {
  return `${KEY_PREFIX}${noteId}`;
}

/**
 * Read the mirrored draft for a note. `null` when absent, unreadable, or
 * corrupt — mirror failures must never break the editor.
 */
export function readMirror(noteId: string): Block[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(mirrorKey(noteId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Defensive: keep only entries that structurally look like blocks.
    const blocks = parsed.filter(
      (block): block is Block =>
        typeof block === "object" &&
        block !== null &&
        typeof (block as Block).id === "string" &&
        typeof (block as Block).type === "string"
    );
    return blocks;
  } catch {
    return null; // private mode / quota / corruption — the autosave still protects data
  }
}

/** Overwrite the mirror with the live draft (debounced by the caller). */
export function writeMirror(noteId: string, blocks: Block[]): void {
  try {
    globalThis.localStorage?.setItem(mirrorKey(noteId), JSON.stringify(blocks));
  } catch {
    // Quota exceeded / private mode — the server pipeline still protects data.
  }
}

/** Drop the mirror once the blocks are durably on the server. */
export function clearMirror(noteId: string): void {
  try {
    globalThis.localStorage?.removeItem(mirrorKey(noteId));
  } catch {
    // Ignore — a stale mirror at worst re-saves identical content.
  }
}

/**
 * Meaningful equality of two block lists — used to decide whether a mirror
 * holds anything the server does not. Compares id, type and the properties
 * the editor can change (text, src, checked, language) in order, so
 * property-key ordering differences in serialized JSON never cause a
 * pointless restore.
 */
export function blocksEqual(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((block, index) => {
    const other = b[index];
    return (
      block.id === other.id &&
      block.type === other.type &&
      (block.properties.text ?? "") === (other.properties.text ?? "") &&
      (block.properties.src ?? null) === (other.properties.src ?? null) &&
      (block.properties.checked ?? null) === (other.properties.checked ?? null) &&
      (block.properties.language ?? null) === (other.properties.language ?? null)
    );
  });
}
