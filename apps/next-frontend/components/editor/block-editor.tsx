"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import type { Block, BlockProperties } from "@/lib/types";
import {
  blockText,
  convertBlock,
  createBlock,
  createSeedBlock,
  getBlock,
  insertBlockAfter,
  isTextualBlock,
  mergeDrafts,
  mergeWithPrevious,
  removeBlock,
  reorderBlocks,
  SEED_BLOCK_ID,
  setBlockText,
  splitBlock,
  updateBlockProperties,
  type BlockOpResult,
  type EditorBlockType,
  type FocusTarget,
} from "@/lib/editor/blocks";
import { useAutosave } from "@/lib/editor/use-autosave";
import { BlockContent } from "@/components/block-view";
import { EditableBlock, type EditableBlockHandle } from "./editable-block";
import { DrawingBlock, ImageBlock } from "./embed-blocks";
import { filterSlashItems, SlashMenu, type SlashItem } from "./slash-menu";
import { SaveIndicator } from "./save-indicator";

interface SlashState {
  blockId: string;
  /** Where the `/` landed in the anchor block's draft. */
  slashOffset: number;
  query: string;
  /** Menu position relative to the editor container. */
  x: number;
  y: number;
}

/**
 * The Phase 3 block editor.
 *
 * Architecture (sub-70ms keystrokes):
 * - Keystrokes update only the focused block's local draft state and the
 *   editor's `draftsRef` map — the parent never re-renders per keystroke.
 * - Structural operations (split/merge/convert/insert/reorder) run through
 *   `applyOp`, which first bakes every live draft into the authoritative
 *   array ("commit-first") so pure ops always read fresh text.
 * - `useAutosave` flushes the merged array via a debounced full-array PUT
 *   to `PUT /api/notes/{id}` (quiet path — no sidebar churn).
 */
export function BlockEditor({
  noteId,
  initialBlocks,
}: {
  noteId: string;
  initialBlocks: Block[];
}) {
  const { saveBlocks } = useNotes();

  const [blocks, setBlocks] = useState<Block[]>(
    initialBlocks.length > 0 ? initialBlocks : [createSeedBlock()]
  );
  // Kept in sync at every write site (commitAllDrafts / applyOp — the only
  // two places setBlocks is called) so handlers always read fresh state.
  const blocksRef = useRef<Block[]>(blocks);

  const draftsRef = useRef(new Map<string, string>());
  const handlesRef = useRef(new Map<string, EditableBlockHandle>());
  const pendingFocusRef = useRef<FocusTarget | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Slash-menu state. The refs are authoritative mirrors updated at every
  // setState call site (all event handlers), so the stable callbacks below
  // read fresh values without render-phase ref writes.
  const slashRef = useRef<SlashState | null>(null);
  const slashActiveIndexRef = useRef(0);
  const dragIndexRef = useRef<number | null>(null);

  const slashItems = useMemo(
    () => filterSlashItems(slash?.query ?? ""),
    [slash?.query]
  );

  const updateSlash = useCallback((next: SlashState | null) => {
    slashRef.current = next;
    setSlash(next);
  }, []);

  const updateSlashActiveIndex = useCallback((index: number) => {
    slashActiveIndexRef.current = index;
    setSlashActiveIndex(index);
  }, []);

  // ─── Save pipeline ────────────────────────────────────────────────────

  const commitAllDrafts = useCallback((): Block[] => {
    const merged = mergeDrafts(blocksRef.current, draftsRef.current);
    draftsRef.current.clear();
    if (merged !== blocksRef.current) {
      blocksRef.current = merged;
      setBlocks(merged);
    }
    return merged;
  }, []);

  const getPayload = useCallback(() => commitAllDrafts(), [commitAllDrafts]);

  const save = useCallback(
    (payload: Block[], options?: { keepalive?: boolean }) =>
      saveBlocks(noteId, payload, options),
    [noteId, saveBlocks]
  );

  const { status, notifyChange, flush, retry } = useAutosave({ getPayload, save });

  /** Commit-first structural mutation + focus request + save ping. */
  const applyOp = useCallback(
    (run: (base: Block[]) => BlockOpResult) => {
      const base = commitAllDrafts();
      const { blocks: next, focus } = run(base);
      let result = next;
      let focusTarget = focus;
      if (result.length === 0) {
        // The document never drops below one editable block.
        result = [createSeedBlock()];
        focusTarget = { blockId: SEED_BLOCK_ID, caretOffset: 0 };
      }
      blocksRef.current = result;
      setBlocks(result);
      pendingFocusRef.current = focusTarget;
      notifyChange();
    },
    [commitAllDrafts, notifyChange]
  );

  // Apply focus requests after the new block list has mounted.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    handlesRef.current.get(target.blockId)?.focus(target.caretOffset);
  }, [blocks]);

  // ─── Block callbacks (stable identities — memo'd blocks skip renders) ─

  const registerHandle = useCallback(
    (blockId: string, handle: EditableBlockHandle | null) => {
      if (handle) handlesRef.current.set(blockId, handle);
      else handlesRef.current.delete(blockId);
    },
    []
  );

  const handleTextChange = useCallback(
    (blockId: string, text: string) => {
      draftsRef.current.set(blockId, text);
      notifyChange();
    },
    [notifyChange]
  );

  const handleSplit = useCallback(
    (blockId: string, caretOffset: number) => {
      applyOp((base) => splitBlock(base, blockId, caretOffset));
    },
    [applyOp]
  );

  const handleMergeBackward = useCallback(
    (blockId: string) => {
      applyOp((base) => mergeWithPrevious(base, blockId));
    },
    [applyOp]
  );

  const handleRemove = useCallback(
    (blockId: string) => {
      applyOp((base) => removeBlock(base, blockId));
    },
    [applyOp]
  );

  const handleConvert = useCallback(
    (
      blockId: string,
      nextText: string,
      type: EditorBlockType,
      propertiesPatch?: Partial<BlockProperties>
    ) => {
      applyOp((base) => ({
        blocks: convertBlock(base, blockId, nextText, type, propertiesPatch),
        focus: null,
      }));
    },
    [applyOp]
  );

  const handleProperties = useCallback(
    (blockId: string, patch: Partial<BlockProperties>) => {
      applyOp((base) => ({
        blocks: updateBlockProperties(base, blockId, patch),
        focus: null,
      }));
    },
    [applyOp]
  );

  const handleNavigate = useCallback(
    (blockId: string, direction: -1 | 1) => {
      const current = blocksRef.current;
      const index = current.findIndex((b) => b.id === blockId);
      if (index === -1) return;
      const target = current[index + direction];
      if (!target) {
        if (direction === 1) {
          // Escape hatch at the document end: keep writing below.
          const created = createBlock("text");
          applyOp((base) => ({
            blocks: insertBlockAfter(base, blockId, created),
            focus: { blockId: created.id, caretOffset: 0 },
          }));
        }
        return;
      }
      if (!isTextualBlock(target.type)) return;
      // Direct DOM focus — no state change, no re-render needed.
      handlesRef.current.get(target.id)?.focus(direction === -1 ? "end" : 0);
    },
    [applyOp]
  );

  const handleMoveBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      const index = blocksRef.current.findIndex((b) => b.id === blockId);
      const to = index === -1 ? -1 : index + direction;
      if (to < 0 || to >= blocksRef.current.length) return;
      applyOp((base) => ({
        blocks: reorderBlocks(base, index, to),
        focus: { blockId, caretOffset: "end" },
      }));
    },
    [applyOp]
  );

  const handleBlurBlock = useCallback(() => {
    flush();
  }, [flush]);

  // ─── Slash menu ────────────────────────────────────────────────────────

  const handleSlashOpen = useCallback((blockId: string, slashOffset: number) => {
    const element = handlesRef.current.get(blockId)?.element;
    const container = containerRef.current;
    if (!element || !container) return;
    const rect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Clamp inside the column so the menu never overflows horizontally.
    const x = Math.max(
      0,
      Math.min(rect.left - containerRect.left, containerRect.width - 224)
    );
    updateSlash({
      blockId,
      slashOffset,
      query: "",
      x,
      y: rect.bottom - containerRect.top + 6,
    });
    updateSlashActiveIndex(0);
  }, [updateSlash, updateSlashActiveIndex]);

  const handleSlashQuery = useCallback((blockId: string, query: string) => {
    const current = slashRef.current;
    if (!current || current.blockId !== blockId) return;
    updateSlash({ ...current, query });
    updateSlashActiveIndex(0);
  }, [updateSlash, updateSlashActiveIndex]);

  const handleSlashNavigate = useCallback((direction: -1 | 1) => {
    const count = filterSlashItems(slashRef.current?.query ?? "").length;
    if (count === 0) return;
    updateSlashActiveIndex(
      (slashActiveIndexRef.current + direction + count) % count
    );
  }, [updateSlashActiveIndex]);

  /** Remove the `/query` text from the anchor block and close the menu. */
  const closeSlash = useCallback(
    (strip: boolean) => {
      const state = slashRef.current;
      updateSlash(null);
      if (!state || !strip) return;
      const live = handlesRef.current.get(state.blockId)?.getText() ?? "";
      const text =
        live.slice(0, state.slashOffset) +
        live.slice(state.slashOffset + 1 + state.query.length);
      applyOp((base) => ({
        blocks: setBlockText(base, state.blockId, text),
        focus: { blockId: state.blockId, caretOffset: state.slashOffset },
      }));
    },
    [applyOp, updateSlash]
  );

  /**
   * Insert the chosen block type. An empty text anchor converts in place;
   * otherwise the new block is inserted below (the `/query` is always
   * stripped from the anchor's draft).
   */
  const handleSlashSelect = useCallback(
    (item?: SlashItem) => {
      const state = slashRef.current;
      if (!state) return;
      const chosen =
        item ?? filterSlashItems(state.query)[slashActiveIndexRef.current];
      updateSlash(null);
      if (!chosen) return; // No matching item — close without stripping.

      const live = handlesRef.current.get(state.blockId)?.getText() ?? "";
      const text =
        live.slice(0, state.slashOffset) +
        live.slice(state.slashOffset + 1 + state.query.length);
      const anchorType = getBlock(blocksRef.current, state.blockId)?.type;
      const convertInPlace = anchorType === "text" && text.trim() === "";

      if (convertInPlace) {
        applyOp((base) => ({
          blocks: convertBlock(base, state.blockId, text, chosen.type),
          focus: { blockId: state.blockId, caretOffset: "end" },
        }));
      } else {
        applyOp((base) => {
          const stripped = setBlockText(base, state.blockId, text);
          const created = createBlock(chosen.type);
          return {
            blocks: insertBlockAfter(stripped, state.blockId, created),
            focus: { blockId: created.id, caretOffset: 0 },
          };
        });
      }
    },
    [applyOp, updateSlash]
  );

  // ─── Drag reorder ───────────────────────────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
    setDragIndex(index);
  }, []);

  const handleDragOverBlock = useCallback((index: number) => {
    setDropIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDropOnBlock = useCallback(
    (index: number) => {
      const from = dragIndexRef.current;
      dragIndexRef.current = null;
      setDragIndex(null);
      setDropIndex(null);
      if (from === null || from === index) return;
      // "Insert at this slot" semantics translated to a final index.
      const to = index > from ? index - 1 : index;
      if (to === from) return;
      applyOp((base) => ({ blocks: reorderBlocks(base, from, to), focus: null }));
    },
    [applyOp]
  );

  // ─── Click below the last block: continue writing ──────────────────────

  const handleClickBelow = useCallback(() => {
    const current = blocksRef.current;
    const last = current[current.length - 1];
    if (last && last.type === "text") {
      const lastDraft = draftsRef.current.get(last.id) ?? blockText(last);
      if (lastDraft === "") {
        handlesRef.current.get(last.id)?.focus("end");
        return;
      }
    }
    const created = createBlock("text");
    applyOp((base) => ({
      blocks: insertBlockAfter(base, last?.id ?? null, created),
      focus: { blockId: created.id, caretOffset: 0 },
    }));
  }, [applyOp]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const renderBlock = (block: Block) => {
    if (block.type === "image") {
      return (
        <ImageBlock
          block={block}
          onProperties={handleProperties}
          onRemove={handleRemove}
        />
      );
    }
    if (block.type === "drawing") {
      return (
        <DrawingBlock
          block={block}
          onProperties={handleProperties}
          onRemove={handleRemove}
        />
      );
    }
    if (isTextualBlock(block.type)) {
      return (
        <EditableBlock
          block={block}
          slashActive={slash?.blockId === block.id}
          onTextChange={handleTextChange}
          onSplit={handleSplit}
          onMergeBackward={handleMergeBackward}
          onRemove={handleRemove}
          onConvert={handleConvert}
          onNavigate={handleNavigate}
          onMoveBlock={handleMoveBlock}
          onProperties={handleProperties}
          onBlurBlock={handleBlurBlock}
          onSlashOpen={handleSlashOpen}
          onSlashQuery={handleSlashQuery}
          onSlashNavigate={handleSlashNavigate}
          onSlashSelect={handleSlashSelect}
          onSlashDismiss={closeSlash}
          registerHandle={registerHandle}
        />
      );
    }
    // Foreign block types (e.g. Phase 4 canvas nodes) render read-only —
    // the editor never corrupts content it cannot edit.
    return <BlockContent block={block} />;
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="mt-6 space-y-1 max-w-[75ch]">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            onDragOver={(e) => {
              e.preventDefault();
              handleDragOverBlock(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnBlock(index);
            }}
            className={`group/row relative ${
              dragIndex === index ? "opacity-40" : ""
            } ${
              dropIndex === index
                ? "before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-accent-neon before:content-['']"
                : ""
            }`}
          >
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                handleDragStart(index);
              }}
              onDragEnd={handleDragEnd}
              className="absolute -left-7 top-1 p-1 text-text-muted/40 hover:text-text-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 cursor-grab"
              aria-label="Drag to reorder block"
              title="Drag to reorder (or Alt+↑/↓)"
            >
              <GripVertical size={13} />
            </button>
            {renderBlock(block)}
          </div>
        ))}

        {/* Drop-below-the-last-block zone */}
        <div
          className={`h-2 ${dropIndex === blocks.length ? "bg-accent-neon/70 rounded-sm" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            handleDragOverBlock(blocks.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDropOnBlock(blocks.length);
          }}
        />

        {/* Click below to keep writing */}
        <button
          type="button"
          onClick={handleClickBelow}
          className="w-full h-32 text-left cursor-text"
          aria-label="Add a block at the end"
        />
      </div>

      {slash && (
        <SlashMenu
          items={slashItems}
          activeIndex={Math.min(slashActiveIndex, Math.max(slashItems.length - 1, 0))}
          x={slash.x}
          y={slash.y}
          onHover={updateSlashActiveIndex}
          onSelect={handleSlashSelect}
          onDismiss={closeSlash}
        />
      )}

      <SaveIndicator status={status} onRetry={retry} />
    </div>
  );
}
