import { describe, expect, it } from "vitest";
import { formatRelativeStamp, parseApiDate } from "./time";

/** Reference instants, all normalized to UTC regardless of runner TZ. */
const T0 = Date.parse("2026-09-21T10:00:00Z");

describe("parseApiDate", () => {
  it("treats the API's naive ISO strings as UTC (pymongo strips the offset)", () => {
    // Regression: naive "10:00" parsed as LOCAL time shifted the instant
    // by the visitor's offset, so a fresh save read "5H AGO" in UTC+5:30.
    expect(parseApiDate("2026-09-21T10:00:00").getTime()).toBe(T0);
    expect(parseApiDate("2026-09-21T10:00:00.123").getTime()).toBe(T0 + 123);
  });

  it("leaves strings that already carry a timezone designator untouched", () => {
    expect(parseApiDate("2026-09-21T10:00:00Z").getTime()).toBe(T0);
    expect(parseApiDate("2026-09-21T15:30:00+05:30").getTime()).toBe(T0);
    expect(parseApiDate("2026-09-21T04:30:00-05:30").getTime()).toBe(T0);
  });
});

describe("formatRelativeStamp", () => {
  it("reads a just-saved naive timestamp as JUST NOW (the +05:30 bug)", () => {
    expect(formatRelativeStamp("2026-09-21T10:00:00", T0 + 30_000)).toBe("JUST NOW");
  });

  it("scales through minutes, hours, and days", () => {
    expect(formatRelativeStamp("2026-09-21T10:00:00", T0 + 5 * 60_000)).toBe("5M AGO");
    expect(formatRelativeStamp("2026-09-21T10:00:00", T0 + 3 * 3_600_000)).toBe("3H AGO");
    expect(formatRelativeStamp("2026-09-21T10:00:00", T0 + 2 * 86_400_000)).toBe("2D AGO");
  });

  it("falls back to the date slice past a week", () => {
    expect(formatRelativeStamp("2026-09-21T10:00:00", T0 + 8 * 86_400_000)).toBe("2026-09-21");
  });

  it("never shows the future as negative (clock skew / TZ flukes)", () => {
    expect(formatRelativeStamp("2026-09-21T10:00:00", T0 - 60_000)).toBe("JUST NOW");
  });
});
