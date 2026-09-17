"use client";

import {
  Code,
  Heading1,
  Heading2,
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
        className="absolute z-30 w-56 bg-background-panel border border-border-thin rounded-md"
        style={{ left: x, top: y }}
      >
        <p className="px-3 py-2.5 text-[11px] font-mono text-text-muted">
          No block matches
        </p>
      </div>
    );
  }

  return (
    <div
      className="absolute z-30 w-56 bg-background-panel border border-border-thin rounded-md overflow-hidden"
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
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              active ? "bg-background-steel" : ""
            }`}
          >
            <Icon size={13} className={active ? "text-accent-neon shrink-0" : "text-text-muted shrink-0"} />
            <span className="flex-1 min-w-0">
              <span
                className={`block text-xs truncate ${
                  active ? "text-accent-neon" : "text-text-primary"
                }`}
              >
                {item.label}
              </span>
              <span className="block text-[10px] font-mono text-text-muted truncate">
                {item.hint}
              </span>
            </span>
          </button>
        );
      })}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border-thin text-[9px] font-mono text-text-muted uppercase">
        <span>↑↓ navigate</span>
        <span>↵ insert</span>
        <span
          // Click-away dismiss without stripping — the textarea keeps focus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDismiss(false)}
          className="cursor-pointer hover:text-text-primary"
        >
          esc close
        </span>
      </div>
    </div>
  );
}
