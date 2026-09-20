"use client";

import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListTodo,
  Minus,
  PenTool,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { EditorBlockType } from "@/lib/editor/blocks";

export interface SlashItem {
  type: EditorBlockType;
  label: string;
  hint: string;
  keywords: string;
}

export const SLASH_ITEMS: SlashItem[] = [
  { type: "text", label: "Text", hint: "Plain paragraph", keywords: "text paragraph plain body" },
  { type: "header-1", label: "Heading 1", hint: "# ", keywords: "h1 heading title header big" },
  { type: "header-2", label: "Heading 2", hint: "## ", keywords: "h2 heading subheader subtitle" },
  { type: "header-3", label: "Heading 3", hint: "### ", keywords: "h3 heading subheader subtitle small heading3" },
  { type: "todo", label: "To-do", hint: "[] ", keywords: "todo task check checkbox" },
  { type: "list-item", label: "List", hint: "- ", keywords: "list bullet item unordered" },
  { type: "code", label: "Code", hint: "```", keywords: "code snippet mono fenced" },
  { type: "divider", label: "Line break", hint: "Horizontal rule", keywords: "divider hr horizontal rule line break separator" },
  { type: "drawing", label: "Drawing", hint: "Sketch pad", keywords: "drawing sketch canvas paint" },
  { type: "image", label: "Image", hint: "Embed by URL", keywords: "image picture photo embed url" },
];

/** Case-insensitive filter over label and keywords. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) || item.keywords.includes(q)
  );
}

const ITEM_ICONS: Record<SlashItem["type"], LucideIcon> = {
  text: Type,
  "header-1": Heading1,
  "header-2": Heading2,
  "header-3": Heading3,
  todo: ListTodo,
  "list-item": List,
  code: Code,
  divider: Minus,
  drawing: PenTool,
  image: Image,
};

export function SlashMenu({
  items,
  activeIndex,
  x,
  y,
  onHover,
  onSelect,
  onDismiss,
}: {
  items: SlashItem[];
  activeIndex: number;
  /** Absolute position relative to the editor container. */
  x: number;
  y: number;
  onHover: (index: number) => void;
  onSelect: (item: SlashItem) => void;
  onDismiss: (strip: boolean) => void;
}) {
  if (items.length === 0) {
    return (
      <div
        className="slash-menu"
        style={{ left: x, top: y }}
      >
        <p className="slash-empty">No block matches.</p>
      </div>
    );
  }

  return (
    <div
      className="slash-menu"
      style={{ left: x, top: y }}
      role="listbox"
      aria-label="Insert block"
    >
      {items.map((item, index) => {
        const Icon = ITEM_ICONS[item.type];
        const active = index === activeIndex;
        return (
          <button
            key={item.type}
            type="button"
            role="option"
            aria-selected={active}
            // preventDefault keeps the caret in the textarea — no blur/flush.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(item)}
            className={`slash-item${active ? " is-active" : ""}`}
          >
            <span className="slash-item-icon"><Icon size={13} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="slash-item-label">{item.label}</span>
              <span className="slash-item-hint">{item.hint}</span>
            </span>
          </button>
        );
      })}
      <div className="slash-foot">
        <span>↑↓ NAVIGATE</span>
        <span>↵ INSERT</span>
        <button
          type="button"
          // Click-away dismiss without stripping — the textarea keeps focus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDismiss(false)}
        >
          ESC CLOSE
        </button>
      </div>
    </div>
  );
}
