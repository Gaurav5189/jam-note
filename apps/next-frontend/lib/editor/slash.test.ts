import { describe, expect, it } from "vitest";
import { slashQueryAfter, stripSlashCommand } from "./slash";

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

describe("slashQueryAfter", () => {
  it("reads an empty query from a bare slash", () => {
    expect(slashQueryAfter("/", 0)).toEqual({ query: "", dismissed: false });
  });

  it("reads the word typed after the slash", () => {
    expect(slashQueryAfter("/head", 0)).toEqual({
      query: "head",
      dismissed: false,
    });
  });

  it("ignores prose following the query word (mid-text slash)", () => {
    // The user dropped the slash into an existing sentence — the rest of
    // the line is NOT part of the query; the menu keeps filtering on the
    // word alone and stays open.
    expect(slashQueryAfter("hello /world and more", 6)).toEqual({
      query: "world",
      dismissed: false,
    });
  });

  it("dismisses when a whitespace lands directly after the slash", () => {
    expect(slashQueryAfter("/ ", 0)).toEqual({ query: "", dismissed: true });
    expect(slashQueryAfter("a / b", 2)).toEqual({ query: "", dismissed: true });
  });

  it("keeps the query when the word ends the text", () => {
    expect(slashQueryAfter("x /head", 2)).toEqual({
      query: "head",
      dismissed: false,
    });
  });

  it("treats a newline like any other whitespace bound", () => {
    expect(slashQueryAfter("/h1\nrest", 0)).toEqual({
      query: "h1",
      dismissed: false,
    });
  });
});
