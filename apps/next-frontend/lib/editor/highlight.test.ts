import { describe, expect, it } from "vitest";
import { tokenize } from "./highlight";

describe("tokenize", () => {
  it("highlights strings, numbers, keywords and function calls", () => {
    const tokens = tokenize('const rate = 0.5; setup("x");', "javascript");
    expect(tokens).toContainEqual({ text: "const", kind: "keyword" });
    expect(tokens).toContainEqual({ text: "0.5", kind: "number" });
    expect(tokens).toContainEqual({ text: '"x"', kind: "string" });
    expect(tokens).toContainEqual({ text: "setup", kind: "fn" });
  });

  it("treats non-call identifiers as plain text", () => {
    const tokens = tokenize("let value = rate;", null);
    expect(tokens).toEqual([
      { text: "let", kind: "keyword" },
      { text: " value = rate;", kind: "plain" },
    ]);
  });

  it("captures // line comments and /* block comments */", () => {
    const tokens = tokenize("// note\nlet x = 1; /* block */", null);
    expect(tokens).toContainEqual({ text: "// note", kind: "comment" });
    expect(tokens).toContainEqual({ text: "/* block */", kind: "comment" });
  });

  it("does not treat # as a comment in non-hash languages", () => {
    const tokens = tokenize("color: #D1FF4D;", "css");
    expect(tokens).not.toContainEqual(expect.objectContaining({ kind: "comment" }));
  });

  it("treats # as a comment in hash-comment languages", () => {
    const tokens = tokenize("# prepare\nx = 1", "python");
    expect(tokens).toContainEqual({ text: "# prepare", kind: "comment" });
  });

  it("handles unterminated strings gracefully", () => {
    const tokens = tokenize('name = "oops', "python");
    expect(tokens).toContainEqual({ text: '"oops', kind: "string" });
  });

  it("merges adjacent tokens of the same kind", () => {
    const tokens = tokenize("a b c", null);
    const plains = tokens.filter((t) => t.kind === "plain");
    expect(plains).toEqual([{ text: "a b c", kind: "plain" }]);
  });

  it("returns no tokens for empty input", () => {
    expect(tokenize("", null)).toEqual([]);
  });
});
