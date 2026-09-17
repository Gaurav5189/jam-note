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
  registerHandle: (blockId: string, handle: EditableBlockHandle | null) => void;
}

const PLACEHOLDER: Record<string, string> = {
  text: "Type '/' for commands…",
  "header-1": "Heading 1",
  "header-2": "Heading 2",
  todo: "To-do",
  "list-item": "List item",
  code: "// code",
};

function EditableBlockImpl(props: EditableBlockProps) {
  const { block, slashActive } = props;
  const {
    onTextChange, onSplit, onMergeBackward, onRemove, onConvert, onNavigate,
    onMoveBlock, onProperties, onSlashOpen, onSlashQuery,
    onSlashNavigate, onSlashSelect, onSlashDismiss, registerHandle,
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
      const query = value.slice(offset + 1);
      // A space closes the menu and leaves the text as typed.
      if (/\s/.test(query)) {
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
          // Open the command menu on the slash about to be inserted.
          // Code blocks opt out — division and URLs stay untouched.
          if (block.type !== "code" && !slashActiveRef.current) {
            slashOffsetRef.current = caret;
            onSlashOpen(block.id, caret);
          }
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

  const textareaClass =
    "w-full bg-transparent text-text-primary placeholder:text-text-muted/60 focus:outline-none resize-none overflow-hidden";

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
          placeholder={PLACEHOLDER["header-1"]}
          aria-label="Heading 1"
          className={`${textareaClass} text-2xl font-semibold leading-snug mt-6 mb-1 break-words`}
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
          placeholder={PLACEHOLDER["header-2"]}
          aria-label="Heading 2"
          className={`${textareaClass} text-xl font-semibold leading-snug mt-5 mb-1 break-words`}
        />
      );
    case "todo":
      return (
        <div className="flex items-start gap-2.5 py-1">
          <button
            type="button"
            // Keep the caret in the textarea — no blur/flush churn on toggle.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              onProperties(block.id, { checked: !block.properties.checked })
            }
            className={`shrink-0 w-4 h-4 mt-1.5 border rounded-sm flex items-center justify-center transition-colors ${
              block.properties.checked
                ? "border-accent-neon bg-accent-neon/10 text-accent-neon"
                : "border-border-thin text-transparent hover:border-accent-neon/60"
            }`}
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
            placeholder={PLACEHOLDER.todo}
            aria-label="To-do item"
            className={`${textareaClass} text-[15px] leading-7 break-words ${
              block.properties.checked ? "line-through text-text-muted" : ""
            }`}
          />
        </div>
      );
    case "list-item":
      return (
        <div className="flex items-start gap-2.5 py-0.5">
          <span className="text-accent-neon shrink-0 mt-0.5 leading-7" aria-hidden>
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
            placeholder={PLACEHOLDER["list-item"]}
            aria-label="List item"
            className={`${textareaClass} text-[15px] leading-7 break-words`}
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
          placeholder={PLACEHOLDER.text}
          aria-label="Text block"
          className={`${textareaClass} text-[15px] leading-7 break-words`}
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
  const shared = "w-full px-3 py-3 text-[13px] font-mono leading-6 whitespace-pre-wrap break-words";
  const tokens = tokenize(draft, block.properties.language ?? null);

  return (
    <div className="bg-background-panel border border-border-thin rounded-sm overflow-hidden my-2">
      <div className="px-3 py-1.5 border-b border-border-thin flex items-center gap-2">
        <input
          value={block.properties.language ?? ""}
          onChange={(e) => onProperties(block.id, { language: e.target.value })}
          placeholder="language"
          aria-label="Code language"
          className="bg-transparent text-[10px] font-mono uppercase tracking-widest text-text-muted placeholder:text-text-muted/60 focus:outline-none w-24"
        />
      </div>
      <div className="relative">
        {/* Highlighted read mode — pointer-events pass through to the
            textarea underneath, so clicking anywhere starts editing. */}
        <pre
          aria-hidden
          className={`${shared} text-text-primary ${focused ? "invisible" : ""}`}
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
          className={`${shared} absolute inset-0 bg-transparent ${
            focused ? "text-text-primary caret-accent-neon" : "text-transparent caret-accent-neon"
          } placeholder:text-text-muted/60 focus:outline-none resize-none overflow-hidden`}
        />
      </div>
    </div>
  );
}

export const EditableBlock = memo(EditableBlockImpl);
