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
  { pattern: "### ", type: "header-3" },
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

// ─── Markdown paste parsing ──────────────────────────────────────────────

export interface ParsedMarkdownBlock {
  type: EditorBlockType;
  text: string;
  properties?: Partial<BlockProperties>;
}

/**
 * Parse multi-line pasted markdown into typed blocks.
 *
 * Rules:
 * - Single-line pastes return null (they stay inline in the current block).
 * - Multi-line plain text with no markdown syntax returns null (stays inline).
 * - Multi-line text with markdown syntax splits into typed blocks:
 *   - `# ` -> header-1
 *   - `## ` -> header-2
 *   - `### ` -> header-3
 *   - `- [ ] `, `* [ ] `, `[] `, `[ ] ` -> unchecked todo
 *   - `- [x] `, `* [x] `, `[x] `, `[X] ` -> checked todo
 *   - `- `, `* ` -> list-item
 *   - ```` ```lang ... ``` ```` -> code block (with language)
 *   - Other non-empty lines -> text blocks
 *   - Empty separator lines between blocks are trimmed
 */
export function parsePastedMarkdown(text: string): ParsedMarkdownBlock[] | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.includes("\n")) {
    return null;
  }

  const lines = normalized.split("\n");

  // Only multi-line content with actual markdown structure is converted.
  // Plain-text multi-line pastes stay inline as regular text.
  const hasMarkdownStructure = lines.some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) return true;
    if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) return true;
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) return true;
    if (/^(?:[-*]\s+)?\[([ xX]?)\]\s+/.test(trimmed)) return true;
    return false;
  });

  if (!hasMarkdownStructure) {
    return null;
  }

  const result: ParsedMarkdownBlock[] = [];
  let inCodeFence = false;
  let codeFenceLang: string | undefined = undefined;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCodeFence) {
      if (line.trim().startsWith("```")) {
        result.push({
          type: "code",
          text: codeLines.join("\n"),
          properties: codeFenceLang ? { language: codeFenceLang } : undefined,
        });
        inCodeFence = false;
        codeFenceLang = undefined;
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const trimmed = line.trim();

    // Opening code fence
    const codeFenceMatch = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (codeFenceMatch) {
      inCodeFence = true;
      codeFenceLang = codeFenceMatch[1] || undefined;
      codeLines = [];
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      result.push({
        type: "header-3",
        text: line.slice(4).trim(),
      });
      continue;
    }
    if (line.startsWith("## ")) {
      result.push({
        type: "header-2",
        text: line.slice(3).trim(),
      });
      continue;
    }
    if (line.startsWith("# ")) {
      result.push({
        type: "header-1",
        text: line.slice(2).trim(),
      });
      continue;
    }

    // Todos
    const todoMatch = line.match(/^(?:[-*]\s+)?\[([ xX]?)\]\s*(.*)$/);
    if (todoMatch) {
      const isChecked = todoMatch[1] === "x" || todoMatch[1] === "X";
      const todoText = (todoMatch[2] ?? "").trim();
      result.push({
        type: "todo",
        text: todoText,
        properties: { checked: isChecked },
      });
      continue;
    }

    // List items
    if (line.startsWith("- ") || line.startsWith("* ")) {
      result.push({
        type: "list-item",
        text: line.slice(2).trim(),
      });
      continue;
    }

    // Empty line: treat as separator
    if (trimmed === "") {
      continue;
    }

    // Fallback: standard text block
    result.push({
      type: "text",
      text: line,
    });
  }

  // Gracefully handle unclosed code fence at EOF
  if (inCodeFence) {
    result.push({
      type: "code",
      text: codeLines.join("\n"),
      properties: codeFenceLang ? { language: codeFenceLang } : undefined,
    });
  }

  return result.length > 0 ? result : null;
}
