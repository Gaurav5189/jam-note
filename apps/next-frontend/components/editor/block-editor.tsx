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
  insertPastedBlocks,
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
import { parsePastedMarkdown } from "@/lib/editor/markdown";
import { useAutosave } from "@/lib/editor/use-autosave";
import { stripSlashCommand } from "@/lib/editor/slash";
import {
  blocksEqual,
  clearMirror,
  readMirror,
  writeMirror,
} from "@/lib/editor/draft-mirror";
import { BlockContent } from "@/components/block-view";
import { EditableBlock, type EditableBlockHandle } from "./editable-block";
import { DrawingBlock, DividerBlock, ImageBlock } from "./embed-blocks";
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

export interface EditorUndoState {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

/**
 * Debounce for crash-recovery mirror writes — per-keystroke writes to
 * localStorage would be wasteful; half a second bounds the mirror's own
 * staleness without any measurable typing cost.
 */
const MIRROR_DEBOUNCE_MS = 500;

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
  onBlocksChange,
  onUndoStateChange,
}: {
  noteId: string;
  initialBlocks: Block[];
  onBlocksChange?: (blocks: Block[]) => void;
  onUndoStateChange?: (state: EditorUndoState) => void;
}) {
  const { saveBlocks } = useNotes();

  const onBlocksChangeRef = useRef(onBlocksChange);
  useEffect(() => {
    onBlocksChangeRef.current = onBlocksChange;
  }, [onBlocksChange]);

  const onUndoStateChangeRef = useRef(onUndoStateChange);
  useEffect(() => {
    onUndoStateChangeRef.current = onUndoStateChange;
  }, [onUndoStateChange]);

  const [blocks, setBlocks] = useState<Block[]>(
    initialBlocks.length > 0 ? initialBlocks : [createSeedBlock()]
  );
  // Kept in sync at every write site (commitAllDrafts / applyOp — the only
  // two places setBlocks is called) so handlers always read fresh state.
  const blocksRef = useRef<Block[]>(blocks);

  const [history, setHistory] = useState<Block[][]>([
    initialBlocks.length > 0 ? initialBlocks : [createSeedBlock()],
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<Block[][]>(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  const historyIndexRef = useRef(historyIndex);
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

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

  const pushHistory = useCallback((nextBlocks: Block[]) => {
    const currentHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    const nextHistory = [...currentHistory, nextBlocks].slice(-50);
    const nextIndex = nextHistory.length - 1;
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
  }, []);

  // ─── Save pipeline ────────────────────────────────────────────────────

  const commitAllDrafts = useCallback((): Block[] => {
    const merged = mergeDrafts(blocksRef.current, draftsRef.current);
    draftsRef.current.clear();
    if (merged !== blocksRef.current) {
      blocksRef.current = merged;
      setBlocks(merged);
      pushHistory(merged);
    }
    return merged;
  }, [pushHistory]);

  const getPayload = useCallback(() => commitAllDrafts(), [commitAllDrafts]);

  const save = useCallback(
    async (payload: Block[], options?: { keepalive?: boolean }) => {
      await saveBlocks(noteId, payload, options);
      onBlocksChangeRef.current?.(payload);
      // Durable on the server — the crash-recovery mirror is no longer needed.
      clearMirror(noteId);
    },
    [noteId, saveBlocks]
  );

  const { status, notifyChange, retry } = useAutosave({ getPayload, save });

  // Sync latest blocks to parent on unmount so switching view modes sees fresh blocks
  useEffect(() => {
    return () => {
      const final = commitAllDrafts();
      onBlocksChangeRef.current?.(final);
    };
  }, [commitAllDrafts]);

  // ─── Crash-recovery mirror ────────────────────────────────────────────
  //
  // Unsaved work is mirrored to localStorage (debounced) so a hard crash,
  // a reload racing the unload flush, or a skipped unload handler can
  // still recover everything on the next visit — the restore effect below
  // picks the mirror up and the ordinary autosave pipeline then pushes it
  // to the server. Mirrors survive hard refreshes (localStorage is not
  // cleared by Ctrl+Shift+R), covering the case unload flushes miss.

  const mirrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reads the refs at CALL time — the unmount cleanup below must see the
  // very latest drafts, not the ones captured when the effect was declared.
  const writeMirrorNow = useCallback(() => {
    writeMirror(noteId, mergeDrafts(blocksRef.current, draftsRef.current));
  }, [noteId]);

  const scheduleMirrorWrite = useCallback(() => {
    if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
    mirrorTimerRef.current = setTimeout(() => {
      mirrorTimerRef.current = null;
      writeMirrorNow();
    }, MIRROR_DEBOUNCE_MS);
  }, [writeMirrorNow]);

  // Recover a mirror left behind by unsaved edits: restore the blocks and
  // re-mark the document dirty so the autosave pipeline PUTs them to the
  // server immediately. Runs client-side only (an effect), so the
  // SSR-rendered markup still matches — no hydration mismatch.
  useEffect(() => {
    const mirror = readMirror(noteId);
    if (!mirror || mirror.length === 0) return;
    if (blocksEqual(mirror, blocksRef.current)) {
      clearMirror(noteId); // Already on the server — nothing to recover.
      return;
    }
    blocksRef.current = mirror;
    draftsRef.current.clear();
    setBlocks(mirror);
    notifyChange();
  }, [noteId, notifyChange]);

  // Edits newer than the mirror debounce would otherwise miss the mirror.
  useEffect(() => {
    return () => {
      if (mirrorTimerRef.current) {
        clearTimeout(mirrorTimerRef.current);
        mirrorTimerRef.current = null;
        writeMirrorNow();
      }
    };
  }, [writeMirrorNow]);

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
      onBlocksChangeRef.current?.(result);
      pushHistory(result);
      pendingFocusRef.current = focusTarget;
      notifyChange();
      scheduleMirrorWrite();
    },
    [commitAllDrafts, notifyChange, pushHistory, scheduleMirrorWrite]
  );

  const handleUndo = useCallback(() => {
    draftsRef.current.clear();
    if (historyIndexRef.current > 0) {
      const nextIdx = historyIndexRef.current - 1;
      const targetBlocks = historyRef.current[nextIdx];
      if (targetBlocks) {
        historyIndexRef.current = nextIdx;
        setHistoryIndex(nextIdx);
        blocksRef.current = targetBlocks;
        setBlocks(targetBlocks);
        onBlocksChangeRef.current?.(targetBlocks);
        notifyChange();
        scheduleMirrorWrite();
      }
    }
  }, [notifyChange, scheduleMirrorWrite]);

  const handleRedo = useCallback(() => {
    draftsRef.current.clear();
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const nextIdx = historyIndexRef.current + 1;
      const targetBlocks = historyRef.current[nextIdx];
      if (targetBlocks) {
        historyIndexRef.current = nextIdx;
        setHistoryIndex(nextIdx);
        blocksRef.current = targetBlocks;
        setBlocks(targetBlocks);
        onBlocksChangeRef.current?.(targetBlocks);
        notifyChange();
        scheduleMirrorWrite();
      }
    }
  }, [notifyChange, scheduleMirrorWrite]);

  useEffect(() => {
    onUndoStateChangeRef.current?.({
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      undo: handleUndo,
      redo: handleRedo,
    });
  }, [historyIndex, history.length, handleUndo, handleRedo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === "z") {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

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
      scheduleMirrorWrite();
    },
    [notifyChange, scheduleMirrorWrite]
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

  const handlePaste = useCallback(
    (
      blockId: string,
      e: React.ClipboardEvent<HTMLTextAreaElement>,
      caretOffset: number
    ) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text) return false;
      const parsed = parsePastedMarkdown(text);
      if (!parsed || parsed.length === 0) return false;
      updateSlash(null);
      applyOp((base) => insertPastedBlocks(base, blockId, caretOffset, parsed));
      return true;
    },
    [applyOp, updateSlash]
  );

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
      const text = stripSlashCommand(live, state.slashOffset, state.query);
      // The op can land on committed text identical to its starting value
      // (fresh block: "" → ""), so the block's render-time draft re-seed
      // never fires — reset the stale `/…` draft imperatively.
      handlesRef.current.get(state.blockId)?.resetDraft(text);
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
      const text = stripSlashCommand(live, state.slashOffset, state.query);
      // Same no-change trap as closeSlash: reset the anchor's stale `/…`
      // draft even when the stripped text equals its committed text.
      handlesRef.current.get(state.blockId)?.resetDraft(text);
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
    if (block.type === "divider") {
      return <DividerBlock block={block} onRemove={handleRemove} />;
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
          onSlashOpen={handleSlashOpen}
          onSlashQuery={handleSlashQuery}
          onSlashNavigate={handleSlashNavigate}
          onSlashSelect={handleSlashSelect}
          onSlashDismiss={closeSlash}
          onPaste={handlePaste}
          registerHandle={registerHandle}
        />
      );
    }
    // Foreign block types (e.g. Phase 4 canvas nodes) render read-only —
    // the editor never corrupts content it cannot edit.
    return <BlockContent block={block} />;
  };

  return (
    <div className="editor-wrap" ref={containerRef}>
      <div className="editor-list">
        {blocks.map((block, index) => (
          <div
            id={`block-${block.id}`}
            key={block.id}
            onDragOver={(e) => {
              e.preventDefault();
              handleDragOverBlock(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnBlock(index);
            }}
            className={`editor-row${dragIndex === index ? " is-dragged" : ""}${
              dropIndex === index ? " editor-before" : ""
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
              className="editor-grip"
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
          className={`editor-drop${dropIndex === blocks.length ? "" : " is-off"}`}
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
          className="editor-below"
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

      {/* Save indicator — fixed bottom-right */}
      <SaveIndicator status={status} onRetry={retry} />
    </div>
  );
}
