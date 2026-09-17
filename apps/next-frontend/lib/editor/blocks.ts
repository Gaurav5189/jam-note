import type { Block, BlockProperties } from "@/lib/types";

// ─── Editor capability set ──────────────────────────────────────────────
//
// The backend accepts any string as `Block.type` (the Pydantic model is
// intentionally open), so these constants define what THIS editor can
// create and edit — not a schema constraint. Foreign block types render
// through the read-only embed fallback and are never corrupted here.

export const EDITOR_BLOCK_TYPES = [
  "text",
  "header-1",
  "header-2",
  "header-3",
  "todo",
  "list-item",
  "code",
  "divider",
  "drawing",
  "image",
] as const;

export type EditorBlockType = (typeof EDITOR_BLOCK_TYPES)[number];

/** Blocks whose content lives in `properties.text` and accept typing. */
export const TEXTUAL_BLOCK_TYPES = [
  "text",
  "header-1",
  "header-2",
  "header-3",
  "todo",
  "list-item",
  "code",
] as const;

export type TextualBlockType = (typeof TEXTUAL_BLOCK_TYPES)[number];

export function isTextualBlock(type: string): type is TextualBlockType {
  return (TEXTUAL_BLOCK_TYPES as readonly string[]).includes(type);
}

// Deterministic id for the block seeded into empty notes. A random id here
// would break hydration — the server and client render would each
// generate a different id for the same seed block.
export const SEED_BLOCK_ID = "block-seed";

export function createSeedBlock(): Block {
  return {
    id: SEED_BLOCK_ID,
    type: "text",
    properties: { text: "" },
    canvas_metadata: null,
  };
}

function generateBlockId(): string {
  // crypto.randomUUID is unavailable in insecure contexts (e.g. a LAN IP
  // over plain http) — fall back to a timestamped random string there.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlock(
  type: EditorBlockType = "text",
  properties: Partial<BlockProperties> = {}
): Block {
  return {
    id: generateBlockId(),
    type,
    properties: { text: "", ...properties },
    canvas_metadata: null,
  };
}

// ─── Operation results ──────────────────────────────────────────────────

export interface FocusTarget {
  blockId: string;
  /** Caret position inside the focused block; `"end"` resolves to the
   *  live textarea's value length (accurate even mid-typing). */
  caretOffset: number | "end";
}

export interface BlockOpResult {
  blocks: Block[];
  /** Where the caret should move after applying the operation. */
  focus: FocusTarget | null;
}

// ─── Pure operations ───────────────────────────────────────────────────
//
// All operations are pure: input arrays are never mutated and unchanged
// blocks keep their referential identity, so React.memo'd block components
// skip re-rendering. Structural operations assume the caller has already
// baked live drafts into the array (the editor's commit-first rule), so
// they read text straight from the blocks.

export function getBlock(blocks: Block[], blockId: string): Block | undefined {
  return blocks.find((block) => block.id === blockId);
}

export function blockText(block: Block): string {
  return block.properties.text ?? "";
}

/** Replace one block in the array, preserving every other identity. */
function replaceBlock(blocks: Block[], blockId: string, next: Block): Block[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1 || blocks[index] === next) return blocks;
  const nextBlocks = blocks.slice();
  nextBlocks[index] = next;
  return nextBlocks;
}

export function setBlockText(blocks: Block[], blockId: string, text: string): Block[] {
  const current = getBlock(blocks, blockId);
  if (!current || blockText(current) === text) return blocks;
  return replaceBlock(blocks, blockId, {
    ...current,
    properties: { ...current.properties, text },
  });
}

/** Bake uncommitted drafts (block id → text) into the authoritative array. */
export function mergeDrafts(
  blocks: Block[],
  drafts: ReadonlyMap<string, string>
): Block[] {
  let result = blocks;
  for (const [blockId, text] of drafts) {
    result = setBlockText(result, blockId, text);
  }
  return result;
}

export function updateBlockProperties(
  blocks: Block[],
  blockId: string,
  patch: Partial<BlockProperties>
): Block[] {
  const current = getBlock(blocks, blockId);
  if (!current) return blocks;
  return replaceBlock(blocks, blockId, {
    ...current,
    properties: { ...current.properties, ...patch },
  });
}

/** Insert a block below `afterBlockId`, or at the very top when null. */
export function insertBlockAfter(
  blocks: Block[],
  afterBlockId: string | null,
  newBlock: Block
): Block[] {
  if (afterBlockId === null) return [newBlock, ...blocks];
  const index = blocks.findIndex((block) => block.id === afterBlockId);
  if (index === -1) return blocks;
  const nextBlocks = blocks.slice();
  nextBlocks.splice(index + 1, 0, newBlock);
  return nextBlocks;
}

/**
 * Split a block at the caret: it keeps the text before the caret and a
 * new block below receives the remainder.
 *
 * Splitting a heading yields plain text below it (headings are single
 * line); todos and list items propagate their type so lists keep shape.
 * Code blocks are never split here — Enter inserts a newline inside them.
 */
export function splitBlock(
  blocks: Block[],
  blockId: string,
  caretOffset: number
): BlockOpResult {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1) return { blocks, focus: null };

  const current = blocks[index];
  const text = blockText(current);
  const offset = Math.max(0, Math.min(caretOffset, text.length));
  const before = text.slice(0, offset);
  const after = text.slice(offset);

  let newType: EditorBlockType = "text";
  let newProperties: Partial<BlockProperties> = { text: after };
  if (current.type === "todo") {
    newType = "todo";
    newProperties = { text: after, checked: false };
  } else if (current.type === "list-item") {
    newType = "list-item";
  }

  const newBlock = createBlock(newType, newProperties);
  const nextBlocks = blocks.slice();
  nextBlocks.splice(
    index,
    1,
    setBlockTextTextOnly(current, before)
  );
  nextBlocks.splice(index + 1, 0, newBlock);
  return { blocks: nextBlocks, focus: { blockId: newBlock.id, caretOffset: 0 } };
}

/**
 * Insert blocks parsed from multi-line markdown paste at the caret position.
 */
export function insertPastedBlocks(
  blocks: Block[],
  targetBlockId: string,
  caretOffset: number,
  parsed: Array<{
    type: EditorBlockType;
    text: string;
    properties?: Partial<BlockProperties>;
  }>
): BlockOpResult {
  if (parsed.length === 0) return { blocks, focus: null };
  const index = blocks.findIndex((b) => b.id === targetBlockId);
  if (index === -1) return { blocks, focus: null };

  const current = blocks[index];
  const currentText = blockText(current);
  const offset = Math.max(0, Math.min(caretOffset, currentText.length));
  const before = currentText.slice(0, offset);
  const after = currentText.slice(offset);

  const newBlocks: Block[] = parsed.map((p) =>
    createBlock(p.type, { text: p.text, ...p.properties })
  );

  const nextBlocks = blocks.slice();

  if (current.type === "text" && currentText.trim() === "") {
    // Replace empty block with the parsed blocks
    nextBlocks.splice(index, 1, ...newBlocks);
  } else {
    // Keep text before caret in target block
    nextBlocks[index] = setBlockTextTextOnly(current, before);
    let insertItems = newBlocks;
    if (after.length > 0) {
      const trailingBlock = createBlock("text", { text: after });
      insertItems = [...newBlocks, trailingBlock];
    }
    nextBlocks.splice(index + 1, 0, ...insertItems);
  }

  const lastInserted = newBlocks[newBlocks.length - 1];
  return {
    blocks: nextBlocks,
    focus: {
      blockId: lastInserted.id,
      caretOffset: "end",
    },
  };
}

function setBlockTextTextOnly(block: Block, text: string): Block {
  return { ...block, properties: { ...block.properties, text } };
}

/**
 * Merge a block into the one above it (Backspace at the start).
 *
 * - The caret lands on the junction between the two texts.
 * - Backspacing on an embed (image/drawing) removes the embed instead.
 * - Merging into an embed above would silently destroy it — refused; embeds
 *   are removed through their own controls.
 * - The first block merges nowhere.
 */
export function mergeWithPrevious(
  blocks: Block[],
  blockId: string
): BlockOpResult {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1 || index === 0) return { blocks, focus: null };

  const current = blocks[index];
  if (!isTextualBlock(current.type)) {
    return removeBlockAt(blocks, index);
  }

  const previous = blocks[index - 1];
  if (!isTextualBlock(previous.type)) {
    return { blocks, focus: null };
  }

  const previousText = blockText(previous);
  // Code blocks hold multi-line text, so join with a newline; plain blocks
  // concatenate directly (the backspace reads as removing the line break).
  const joiner = previous.type === "code" ? "\n" : "";
  const mergedText = previousText + joiner + blockText(current);

  const nextBlocks = blocks.slice();
  nextBlocks.splice(
    index - 1,
    1,
    setBlockTextTextOnly(previous, mergedText)
  );
  nextBlocks.splice(index, 1);
  return {
    blocks: nextBlocks,
    focus: { blockId: previous.id, caretOffset: previousText.length + joiner.length },
  };
}

export function removeBlock(blocks: Block[], blockId: string): BlockOpResult {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1) return { blocks, focus: null };
  return removeBlockAt(blocks, index);
}

function removeBlockAt(blocks: Block[], index: number): BlockOpResult {
  const removedId = blocks[index].id;
  const nextBlocks = blocks.filter((block) => block.id !== removedId);

  // Focus the block above (caret at its end) or the block that slid into
  // this slot. When the document becomes empty the editor seeds a fresh
  // text block, so a null focus target is fine here.
  const previous = blocks[index - 1];
  if (previous) {
    return {
      blocks: nextBlocks,
      focus: { blockId: previous.id, caretOffset: "end" },
    };
  }
  const next = blocks[index + 1];
  if (next) {
    return { blocks: nextBlocks, focus: { blockId: next.id, caretOffset: 0 } };
  }
  return { blocks: nextBlocks, focus: null };
}

/**
 * Move a block to a final index (`toIndex` is the position in the array
 * AFTER the move, not the slot it was dropped over).
 */
export function reorderBlocks(
  blocks: Block[],
  fromIndex: number,
  toIndex: number
): Block[] {
  const invalid =
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= blocks.length ||
    toIndex >= blocks.length;
  if (invalid) return blocks;

  const nextBlocks = blocks.slice();
  const [moved] = nextBlocks.splice(fromIndex, 1);
  nextBlocks.splice(toIndex, 0, moved);
  return nextBlocks;
}

/**
 * Change a block's type. `nextText` is the block's full post-conversion
 * text — the caller strips markdown prefixes or slash-command remnants.
 * Stale properties from the previous type are cleaned up: todos own
 * `checked`, code blocks own `language`.
 */
export function convertBlock(
  blocks: Block[],
  blockId: string,
  nextText: string,
  type: EditorBlockType,
  propertiesPatch: Partial<BlockProperties> = {}
): Block[] {
  const current = getBlock(blocks, blockId);
  if (!current) return blocks;

  const properties: BlockProperties = {
    ...current.properties,
    ...propertiesPatch,
    text: nextText,
  };
  if (type === "todo") {
    if (properties.checked == null) properties.checked = false;
  } else {
    delete properties.checked;
  }
  if (type !== "code") {
    delete properties.language;
  }
  return replaceBlock(blocks, blockId, { ...current, type, properties });
}
