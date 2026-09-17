import { describe, expect, it } from "vitest";
import { CODE_FENCE, matchCodeFence, matchMarkdownTrigger } from "./markdown";

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

  it("does not match deeper headings as header-1", () => {
    // Only two heading levels exist in the block schema.
    expect(matchMarkdownTrigger("### ")).toBeNull();
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
