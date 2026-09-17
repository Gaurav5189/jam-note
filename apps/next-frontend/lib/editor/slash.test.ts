import { describe, expect, it } from "vitest";
import { stripSlashCommand } from "./slash";

describe("stripSlashCommand", () => {
  it("removes a bare slash from an empty block", () => {
    expect(stripSlashCommand("/", 0, "")).toBe("");
  });

  it("removes the slash together with its query", () => {
    expect(stripSlashCommand("/todo", 0, "todo")).toBe("");
  });

  it("keeps the text typed before the command", () => {
    expect(stripSlashCommand("hello /", 6, "")).toBe("hello ");
  });

  it("preserves any text after the command (defensive)", () => {
    // A space dismisses the menu, so live text can never follow the query —
    // but if it somehow does, only the `/query` region is removed and the
    // trailing text (with its leading space) survives intact.
    expect(stripSlashCommand("hello /wor bye", 6, "wor")).toBe("hello  bye");
  });

  it("removes a mid-text slash with no query", () => {
    expect(stripSlashCommand("a / b", 2, "")).toBe("a  b");
  });

  it("tolerates a stale query longer than the remaining text", () => {
    // The user deleted characters the query state has not seen — slicing
    // past the end is a harmless no-op.
    expect(stripSlashCommand("/", 0, "extra")).toBe("");
  });
});
