import type { BlockProperties } from "@/lib/types";
import type { EditorBlockType } from "./blocks";

// ─── Markdown auto-conversion ────────────────────────────────────────────
//
// Conversions fire on the key that terminates the pattern, and only when
// the pattern is the ENTIRE text before the caret — typing "# " in the
// middle of a sentence never converts anything.

export interface MarkdownMatch {
  type: EditorBlockType;
  /** Characters to strip from the start of the text (the pattern itself). */
  prefixLength: number;
  /** Extra properties for the converted block (e.g. a checked to-do). */
  properties?: Partial<BlockProperties>;
}

// Longest patterns first so "## " is not shadowed by "# " (matching is
// exact-equality, but the order documents intent).
const SPACE_TRIGGERS: Array<{
  pattern: string;
  type: EditorBlockType;
  checked?: boolean;
}> = [
  { pattern: "## ", type: "header-2" },
  { pattern: "# ", type: "header-1" },
  { pattern: "- ", type: "list-item" },
  { pattern: "* ", type: "list-item" },
  { pattern: "[x] ", type: "todo", checked: true },
  { pattern: "[ ] ", type: "todo", checked: false },
  { pattern: "[] ", type: "todo", checked: false },
];

/** Match the text before the caret when the user just pressed Space. */
export function matchMarkdownTrigger(textBeforeCaret: string): MarkdownMatch | null {
  for (const trigger of SPACE_TRIGGERS) {
    if (textBeforeCaret === trigger.pattern) {
      return {
        type: trigger.type,
        prefixLength: trigger.pattern.length,
        properties:
          trigger.type === "todo" ? { checked: trigger.checked ?? false } : undefined,
      };
    }
  }
  return null;
}

// Enter-triggered: a bare code fence converts the block to a code block.
export const CODE_FENCE = "```";

/** True when the block's text is exactly a code fence (Enter pressed). */
export function matchCodeFence(text: string): boolean {
  return text === CODE_FENCE;
}
