"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check } from "lucide-react";
import type { Block, BlockProperties } from "@/lib/types";
import { blockText, type EditorBlockType } from "@/lib/editor/blocks";
import { slashQueryAfter } from "@/lib/editor/slash";
import { matchCodeFence, matchMarkdownTrigger } from "@/lib/editor/markdown";
import { TOKEN_CLASS, tokenize } from "@/lib/editor/highlight";

/**
 * Imperative surface the editor uses for focus and live-text access.
 * `getText` reads the local draft, which can be ahead of the committed
 * array mid-typing — that is exactly why the editor needs it.
 */
export interface EditableBlockHandle {
  focus(caret: number | "end"): void;
  getText(): string;
  /**
   * Force the local draft to `text`. Needed after structural ops that end
   * on the same committed text they started with (e.g. stripping a slash
   * command from a block whose text was never committed): the render-time
   * re-seed below only fires when committed text *changes*, so a no-change
   * op would otherwise leave a stale `/…` draft on screen — and typing
   * after it would bake the slash back into the block.
   */
  resetDraft(text: string): void;
  /** Anchor element for the slash menu. */
  element: HTMLTextAreaElement | null;
}

export interface EditableBlockProps {
  block: Block;
  /** True while the slash menu is anchored to this block. */
  slashActive: boolean;
  // Keystroke ping — writes to the editor's drafts ref, never re-renders it.
  onTextChange: (blockId: string, text: string) => void;
  onSplit: (blockId: string, caretOffset: number) => void;
  onMergeBackward: (blockId: string) => void;
  onRemove: (blockId: string) => void;
  onConvert: (
    blockId: string,
    nextText: string,
    type: EditorBlockType,
    propertiesPatch?: Partial<BlockProperties>
  ) => void;
  onNavigate: (blockId: string, direction: -1 | 1) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onProperties: (blockId: string, patch: Partial<BlockProperties>) => void;
  onSlashOpen: (blockId: string, slashOffset: number) => void;
  onSlashQuery: (blockId: string, query: string) => void;
  onSlashNavigate: (direction: -1 | 1) => void;
  onSlashSelect: () => void;
  onSlashDismiss: (strip: boolean) => void;
  onPaste?: (
    blockId: string,
    event: React.ClipboardEvent<HTMLTextAreaElement>,
    caretOffset: number
  ) => boolean | void;
  registerHandle: (blockId: string, handle: EditableBlockHandle | null) => void;
}

const PLACEHOLDER: Record<string, string> = {
  text: "Type '/' for commands…",
  "header-1": "Heading 1",
  "header-2": "Heading 2",
  "header-3": "Heading 3",
  todo: "To-do",
  "list-item": "List item",
  code: "// code",
};

function EditableBlockImpl(props: EditableBlockProps) {
  const { block, slashActive } = props;
  const {
    onTextChange, onSplit, onMergeBackward, onRemove, onConvert, onNavigate,
    onMoveBlock, onProperties, onSlashOpen, onSlashQuery,
    onSlashNavigate, onSlashSelect, onSlashDismiss, onPaste, registerHandle,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedText = blockText(block);
  const [draft, setDraft] = useState(committedText);
  const [focused, setFocused] = useState(false);

  // Re-seed the local draft when the committed text changes from the
  // outside (split, merge, conversion, slash-command strip) — the
  // React-documented "adjust state when a prop changes" pattern. During
  // plain typing the committed text equals the draft, so this never fires.
  const [prevCommitted, setPrevCommitted] = useState(committedText);
  if (committedText !== prevCommitted) {
    setPrevCommitted(committedText);
    setDraft(committedText);
  }

  // Latest refs so the stable callbacks below never close over stale
  // values. React flushes passive effects before the next browser event,
  // so handlers always read fresh values here.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const slashActiveRef = useRef(slashActive);
  useEffect(() => {
    slashActiveRef.current = slashActive;
  }, [slashActive]);
  const slashOffsetRef = useRef(-1);

  // Auto-grow the textarea to its content — never shows a scrollbar.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Register the imperative handle once; getText reads the latest ref.
  useEffect(() => {
    const handle: EditableBlockHandle = {
      focus: (caret) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const target =
          caret === "end"
            ? el.value.length
            : Math.max(0, Math.min(caret, el.value.length));
        el.setSelectionRange(target, target);
      },
      getText: () => draftRef.current,
      resetDraft: (text) => setDraft(text),
      // Getter — the textarea element can be replaced when a block's
      // rendered shape changes (e.g. a markdown conversion swaps JSX);
      // a captured value would go stale and misplace the slash menu.
      get element() {
        return textareaRef.current;
      },
    };
    registerHandle(block.id, handle);
    return () => registerHandle(block.id, null);
  }, [block.id, registerHandle]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft(value);
      onTextChange(block.id, value);

      if (!slashActiveRef.current) return;
      const offset = slashOffsetRef.current;
      // The slash was deleted or moved — silently close the menu.
      if (offset < 0 || value.slice(offset, offset + 1) !== "/") {
        onSlashDismiss(false);
        return;
      }
      // The query is only the WORD right after the slash (prose beyond
      // it is not the query, so mid-sentence triggers keep filtering);
      // a space directly after the slash closes the menu and leaves the
      // text as typed.
      const { query, dismissed } = slashQueryAfter(value, offset);
      if (dismissed) {
        onSlashDismiss(false);
        return;
      }
      onSlashQuery(block.id, query);
    },
    [block.id, onTextChange, onSlashDismiss, onSlashQuery]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Never intercept IME composition (Enter confirms the composition).
      if (event.nativeEvent.isComposing) return;
      const el = event.currentTarget;
      const caret = el.selectionStart;

      // While the slash menu is open it owns the navigation keys.
      if (slashActiveRef.current) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onSlashNavigate(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onSlashNavigate(-1);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          onSlashSelect();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onSlashDismiss(true);
          return;
        }
      }

      // Alt+↑/↓ moves the block past its neighbour (keyboard reorder).
      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        onMoveBlock(block.id, event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      switch (event.key) {
        case "Enter": {
          // Code blocks take a native newline (textareas are multiline);
          // the browser inserts it and handleChange syncs the draft.
          if (block.type === "code") return;
          event.preventDefault();
          // A bare code fence converts the block instead of splitting it.
          if (matchCodeFence(draftRef.current)) {
            onConvert(block.id, "", "code");
            return;
          }
          onSplit(block.id, caret);
          return;
        }
        case "Backspace": {
          if (el.selectionStart !== 0 || el.selectionEnd !== 0) return;
          event.preventDefault();
          // Styled blocks degrade to text first (Notion behaviour);
          // empty text blocks are removed; the rest merge upward.
          if (block.type !== "text") {
            onConvert(block.id, draftRef.current, "text");
            return;
          }
          if (draftRef.current === "") {
            onRemove(block.id);
            return;
          }
          onMergeBackward(block.id);
          return;
        }
        case " ": {
          // Markdown auto-conversion — the pattern must be the entire text
          // before the caret at the moment the space lands.
          if (block.type === "code") return;
          const match = matchMarkdownTrigger(draftRef.current.slice(0, caret));
          if (!match) return;
          event.preventDefault();
          onConvert(
            block.id,
            draftRef.current.slice(match.prefixLength),
            match.type,
            match.properties
          );
          return;
        }
        case "ArrowUp": {
          // Only hop to the block above when the caret is on the first line.
          if (el.value.lastIndexOf("\n", caret - 1) !== -1) return;
          event.preventDefault();
          onNavigate(block.id, -1);
          return;
        }
        case "ArrowDown": {
          if (el.value.indexOf("\n", caret) !== -1) return;
          event.preventDefault();
          onNavigate(block.id, 1);
          return;
        }
        case "Escape": {
          // Escape exits a code block downward (the natural escape hatch).
          if (block.type === "code") onNavigate(block.id, 1);
          return;
        }
        case "/": {
          // Global trigger (Phase 6 fix): the menu opens at the caret of
          // ANY focused textual block — empty or not, any placeholder.
          // Code blocks take the natural trigger only when the slash
          // lands as the block's first character (`//`, paths, URLs stay
          // untouched mid-code); the explicit Ctrl/Cmd+/ combo forces it
          // open anywhere, code included. The slash still types in
          // either way, so strip-on-select keeps working uniformly.
          if (slashActiveRef.current) return;
          const forced = event.ctrlKey || event.metaKey;
          const firstChar = caret === 0 || draftRef.current === "";
          if (!forced && block.type === "code" && !firstChar) return;
          // Set synchronously (not via the prop effect): the input event
          // that inserts this slash fires before a passive effect would,
          // and it must observe the active menu to seed the query.
          slashActiveRef.current = true;
          slashOffsetRef.current = caret;
          onSlashOpen(block.id, caret);
          return;
        }
      }
    },
    [
      block.id, block.type, onConvert, onMergeBackward, onMoveBlock,
      onNavigate, onRemove, onSlashDismiss, onSlashNavigate, onSlashOpen,
      onSlashSelect, onSplit,
    ]
  );

  // Blur only toggles the code overlay — it never triggers a save. Saving
  // happens after the 10s idle window or the safety flushes (tab hide,
  // unload, unmount), so block-to-block caret hops don't write-amplify.
  const handleBlur = useCallback(() => setFocused(false), []);

  const handleFocus = useCallback(() => setFocused(true), []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onPaste || block.type === "code") return;
      const caret = e.currentTarget.selectionStart ?? 0;
      const handled = onPaste(block.id, e, caret);
      if (handled) {
        e.preventDefault();
      }
    },
    [block.id, block.type, onPaste]
  );

  const textareaClass = "eb";

  switch (block.type) {
    case "header-1":
      return (
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={PLACEHOLDER["header-1"]}
          aria-label="Heading 1"
          className={`${textareaClass} eb-h1`}
        />
      );
    case "header-2":
      return (
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={PLACEHOLDER["header-2"]}
          aria-label="Heading 2"
          className={`${textareaClass} eb-h2`}
        />
      );
    case "header-3":
      return (
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={PLACEHOLDER["header-3"]}
          aria-label="Heading 3"
          className={`${textareaClass} eb-h3`}
        />
      );
    case "todo":
      return (
        <div className="eb-row">
          <button
            type="button"
            // Keep the caret in the textarea — no blur/flush churn on toggle.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              onProperties(block.id, { checked: !block.properties.checked })
            }
            className={`eb-check${block.properties.checked ? " on" : ""}`}
            aria-label={block.properties.checked ? "Mark as not done" : "Mark as done"}
          >
            {block.properties.checked ? <Check size={11} /> : null}
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={PLACEHOLDER.todo}
            aria-label="To-do item"
            className={`${textareaClass}${block.properties.checked ? " eb-done" : ""}`}
          />
        </div>
      );
    case "list-item":
      return (
        <div className="eb-row">
          <span className="eb-marker" aria-hidden>
            ▸
          </span>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={PLACEHOLDER["list-item"]}
            aria-label="List item"
            className={textareaClass}
          />
        </div>
      );
    case "code":
      return (
        <CodeBlock
          block={block}
          draft={draft}
          focused={focused}
          textareaRef={textareaRef}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onProperties={onProperties}
        />
      );
    default:
      return (
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={PLACEHOLDER.text}
          aria-label="Text block"
          className={textareaClass}
        />
      );
  }
}

/**
 * Code blocks edit in a plain textarea but display a highlighted overlay
 * while blurred. Both renderings share identical typography classes so
 * toggling focus never shifts the layout.
 */
function CodeBlock({
  block,
  draft,
  focused,
  textareaRef,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  onProperties,
}: {
  block: Block;
  draft: string;
  focused: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onFocus: React.FocusEventHandler;
  onBlur: React.FocusEventHandler;
  onProperties: (blockId: string, patch: Partial<BlockProperties>) => void;
}) {
  const shared = "eb-code-shared";
  const tokens = tokenize(draft, block.properties.language ?? null);

  return (
    <div className="eb-code-frame">
      <div className="eb-code-head">
        <input
          value={block.properties.language ?? ""}
          onChange={(e) => onProperties(block.id, { language: e.target.value })}
          placeholder="language"
          aria-label="Code language"
          className="eb-code-lang"
        />
      </div>
      <div className="eb-code-rel">
        {/* Highlighted read mode — pointer-events pass through to the
            textarea underneath, so clicking anywhere starts editing. */}
        <pre
          aria-hidden
          className={`${shared} eb-code-pre${focused ? " is-hidden" : ""}`}
        >
          {tokens.length === 0 ? "\n" : null}
          {tokens.map((token, index) => (
            <span key={index} className={TOKEN_CLASS[token.kind]}>
              {token.text}
            </span>
          ))}
        </pre>
        <textarea
          ref={textareaRef}
          rows={1}
          spellCheck={false}
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={PLACEHOLDER.code}
          aria-label="Code block"
          className={`${shared} eb-code-ta${focused ? " is-editing" : ""}`}
        />
      </div>
    </div>
  );
}

export const EditableBlock = memo(EditableBlockImpl);
