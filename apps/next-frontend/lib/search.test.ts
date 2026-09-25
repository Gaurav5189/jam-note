import { describe, expect, it } from "vitest";
import {
  getSearchResultUrl,
  parseBlockIdFromHash,
  parseHighlightSegments,
  type SearchResponse,
} from "./search";

describe("search utilities", () => {
  describe("parseHighlightSegments", () => {
    it("returns empty array for empty string", () => {
      expect(parseHighlightSegments("")).toEqual([]);
    });

    it("returns single non-highlighted segment for unhighlighted text", () => {
      expect(parseHighlightSegments("plain text")).toEqual([
        { text: "plain text", highlighted: false },
      ]);
    });

    it("parses <em> highlighted fragments correctly", () => {
      const input = "Deploy with <em>Docker</em> Swarm now";
      expect(parseHighlightSegments(input)).toEqual([
        { text: "Deploy with ", highlighted: false },
        { text: "Docker", highlighted: true },
        { text: " Swarm now", highlighted: false },
      ]);
    });

    it("parses <mark> highlighted fragments correctly", () => {
      const input = "<mark>Kafka</mark> streamer running";
      expect(parseHighlightSegments(input)).toEqual([
        { text: "Kafka", highlighted: true },
        { text: " streamer running", highlighted: false },
      ]);
    });

    it("handles multiple highlights in the same snippet", () => {
      const input = "Use <em>Postgres</em> or <em>Mongo</em> database";
      expect(parseHighlightSegments(input)).toEqual([
        { text: "Use ", highlighted: false },
        { text: "Postgres", highlighted: true },
        { text: " or ", highlighted: false },
        { text: "Mongo", highlighted: true },
        { text: " database", highlighted: false },
      ]);
    });
  });

  describe("parseBlockIdFromHash", () => {
    it("extracts block ID from standard #block-{id} format", () => {
      expect(parseBlockIdFromHash("#block-bk_123")).toBe("bk_123");
      expect(parseBlockIdFromHash("#block-507f1f77bcf86cd799439011")).toBe("507f1f77bcf86cd799439011");
    });

    it("extracts block ID even if hash has no leading #", () => {
      expect(parseBlockIdFromHash("block-xyz_789")).toBe("xyz_789");
    });

    it("handles URL-encoded characters in block ID", () => {
      expect(parseBlockIdFromHash("#block-section%20one")).toBe("section one");
    });

    it("returns null for non-block hashes or empty hashes", () => {
      expect(parseBlockIdFromHash("")).toBeNull();
      expect(parseBlockIdFromHash("#")).toBeNull();
      expect(parseBlockIdFromHash("#title")).toBeNull();
      expect(parseBlockIdFromHash("#block-")).toBeNull();
      expect(parseBlockIdFromHash("#other-anchor")).toBeNull();
    });
  });

  describe("getSearchResultUrl", () => {
    it("generates deep link when block_id is present", () => {
      expect(getSearchResultUrl("note-1", "blk-99")).toBe("/notes/note-1#block-blk-99");
    });

    it("generates root note link when block_id is null", () => {
      expect(getSearchResultUrl("note-1", null)).toBe("/notes/note-1");
    });
  });

  describe("SearchResponse payload structure", () => {
    it("accepts valid magic response envelope", () => {
      const response: SearchResponse = {
        magic: true,
        results: [
          {
            note_id: "note-1",
            block_id: "blk-1",
            note_title: "Architecture",
            snippet: "Deploying <em>Docker</em> containers",
            rank: 0,
          },
        ],
      };

      expect(response.magic).toBe(true);
      expect(response.results).toHaveLength(1);
      expect(response.results[0].block_id).toBe("blk-1");
    });

    it("accepts offline degraded fallback envelope (magic: false)", () => {
      const response: SearchResponse = {
        magic: false,
        results: [
          {
            note_id: "note-fallback",
            block_id: null,
            note_title: "Docker Setup Guide",
            snippet: "Docker Setup Guide",
            rank: 0,
          },
        ],
      };

      expect(response.magic).toBe(false);
      expect(response.results[0].block_id).toBeNull();
    });
  });
});
