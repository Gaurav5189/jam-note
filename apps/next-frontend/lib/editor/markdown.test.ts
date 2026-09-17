import { describe, expect, it } from "vitest";
import {
  CODE_FENCE,
  matchCodeFence,
  matchMarkdownTrigger,
  parsePastedMarkdown,
} from "./markdown";

describe("matchMarkdownTrigger (Space-triggered)", () => {
  it("converts '# ' to header-1", () => {
    expect(matchMarkdownTrigger("# ")).toEqual({
      type: "header-1",
      prefixLength: 2,
      properties: undefined,
    });
  });

  it("converts '## ' to header-2", () => {
    expect(matchMarkdownTrigger("## ")).toEqual({
      type: "header-2",
      prefixLength: 3,
      properties: undefined,
    });
  });

  it("converts '- ' and '* ' to list-item", () => {
    expect(matchMarkdownTrigger("- ")?.type).toBe("list-item");
    expect(matchMarkdownTrigger("* ")?.type).toBe("list-item");
  });

  it("converts '[] ' to an unchecked todo", () => {
    const match = matchMarkdownTrigger("[] ");
    expect(match?.type).toBe("todo");
    expect(match?.properties?.checked).toBe(false);
  });

  it("converts '[ ] ' to an unchecked todo", () => {
    expect(matchMarkdownTrigger("[ ] ")?.properties?.checked).toBe(false);
  });

  it("converts '[x] ' to a checked todo", () => {
    const match = matchMarkdownTrigger("[x] ");
    expect(match?.type).toBe("todo");
    expect(match?.properties?.checked).toBe(true);
  });

  it("does not match prefixes without the trailing space", () => {
    expect(matchMarkdownTrigger("#")).toBeNull();
    expect(matchMarkdownTrigger("##")).toBeNull();
    expect(matchMarkdownTrigger("-")).toBeNull();
  });

  it("does not match when the pattern is embedded in text", () => {
    expect(matchMarkdownTrigger("hello # ")).toBeNull();
    expect(matchMarkdownTrigger("# hello # ")).toBeNull();
    expect(matchMarkdownTrigger("note - ")).toBeNull();
  });

  it("converts '### ' to header-3", () => {
    expect(matchMarkdownTrigger("### ")).toEqual({
      type: "header-3",
      prefixLength: 4,
      properties: undefined,
    });
  });

  it("does not match deeper headings as header-1/2/3", () => {
    // Only three heading levels exist in the block schema.
    expect(matchMarkdownTrigger("#### ")).toBeNull();
  });
});

describe("matchCodeFence (Enter-triggered)", () => {
  it("matches a bare code fence", () => {
    expect(matchCodeFence(CODE_FENCE)).toBe(true);
  });

  it("rejects fences with content around them", () => {
    expect(matchCodeFence("```python")).toBe(false);
    expect(matchCodeFence("``` ")).toBe(false);
    expect(matchCodeFence("```")).toBe(true);
  });
});

describe("parsePastedMarkdown", () => {
  it("returns null for single-line text even with markdown syntax", () => {
    expect(parsePastedMarkdown("# Single line heading")).toBeNull();
    expect(parsePastedMarkdown("- Item")).toBeNull();
    expect(parsePastedMarkdown("Just plain line")).toBeNull();
  });

  it("returns null for multi-line plain text with no markdown structure", () => {
    const plain = "Hello there\nThis is paragraph two\nAnd paragraph three.";
    expect(parsePastedMarkdown(plain)).toBeNull();
  });

  it("parses multi-line text with headings, lists, and paragraphs", () => {
    const md = `# Project Plan\n\nA brief description here.\n\n## Subtasks\n- Research\n* Prototype`;
    const parsed = parsePastedMarkdown(md);
    expect(parsed).toEqual([
      { type: "header-1", text: "Project Plan" },
      { type: "text", text: "A brief description here." },
      { type: "header-2", text: "Subtasks" },
      { type: "list-item", text: "Research" },
      { type: "list-item", text: "Prototype" },
    ]);
  });

  it("parses todos in various markdown formats", () => {
    const md = `# Checklist\n- [ ] Task 1\n* [x] Task 2\n[ ] Task 3\n[x] Task 4\n[] Task 5`;
    const parsed = parsePastedMarkdown(md);
    expect(parsed).toEqual([
      { type: "header-1", text: "Checklist" },
      { type: "todo", text: "Task 1", properties: { checked: false } },
      { type: "todo", text: "Task 2", properties: { checked: true } },
      { type: "todo", text: "Task 3", properties: { checked: false } },
      { type: "todo", text: "Task 4", properties: { checked: true } },
      { type: "todo", text: "Task 5", properties: { checked: false } },
    ]);
  });

  it("parses fenced code blocks with language and multiple lines", () => {
    const md = `# Code Example\n\`\`\`python\ndef add(a, b):\n    return a + b\n\`\`\`\nDone.`;
    const parsed = parsePastedMarkdown(md);
    expect(parsed).toEqual([
      { type: "header-1", text: "Code Example" },
      {
        type: "code",
        text: "def add(a, b):\n    return a + b",
        properties: { language: "python" },
      },
      { type: "text", text: "Done." },
    ]);
  });

  it("handles unclosed code fence at EOF gracefully", () => {
    const md = `# Incomplete\n\`\`\`typescript\nconst x = 42;`;
    const parsed = parsePastedMarkdown(md);
    expect(parsed).toEqual([
      { type: "header-1", text: "Incomplete" },
      {
        type: "code",
        text: "const x = 42;",
        properties: { language: "typescript" },
      },
    ]);
  });

  it("normalizes Windows CRLF newlines", () => {
    const md = "# Heading\r\n\r\n- List 1\r\n- List 2\r\n";
    const parsed = parsePastedMarkdown(md);
    expect(parsed).toEqual([
      { type: "header-1", text: "Heading" },
      { type: "list-item", text: "List 1" },
      { type: "list-item", text: "List 2" },
    ]);
  });
});
