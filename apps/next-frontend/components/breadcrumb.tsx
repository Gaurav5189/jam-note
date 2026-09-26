"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Middle-truncating breadcrumb chain — make/design.md §7.
 *
 * While the chain fits, every segment shows (identical markup to the
 * old joined-string render, so desktop is untouched). The moment it
 * overflows its box, the MIDDLE segments collapse to a single "…":
 * `WORKSPACE / … / leaf`. The first and last (leaf) segments always
 * stay, and a still-too-long leaf falls back to the ordinary CSS
 * ellipsis with the full chain exposed on the title tooltip — the one
 * thing the user needs is never the thing that gets cut.
 *
 * Measurement: a ResizeObserver re-checks on every content or
 * container size change. Collapse is one-way per overflow; expanding
 * back requires the cached full-chain width to fit again — that guard
 * is what keeps collapse/expand from oscillating at the seam.
 */

type Fit = "full" | "cut";

export function Breadcrumb({
  segments,
  className,
  ariaLabel,
  separator = " / ",
}: {
  segments: ReadonlyArray<string>;
  className?: string;
  /** Defaults to the joined chain; pass to keep a stable label. */
  ariaLabel?: string;
  separator?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState<Fit>("full");
  // Width of the fully expanded chain at the last measurement (px).
  const fullWidthRef = useRef(0);

  const joined = segments.join(separator);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const available = el.clientWidth;
      if (fit === "full") {
        const full = el.scrollWidth;
        if (full > available) {
          fullWidthRef.current = full;
          setFit("cut");
        }
      } else if (fullWidthRef.current > 0 && fullWidthRef.current <= available) {
        setFit("full");
      }
    };
    // ResizeObserver fires once on observe() with the current size —
    // that is the initial measurement; no sync setState in the body.
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, joined]);

  if (segments.length === 0) return null;
  const label = ariaLabel ?? joined;

  if (fit === "cut" && segments.length > 2) {
    return (
      <span ref={ref} className={className} title={joined} aria-label={label}>
        {segments[0]}
        {separator}…{separator}
        {segments[segments.length - 1]}
      </span>
    );
  }
  return (
    <span ref={ref} className={className} title={joined} aria-label={label}>
      {joined}
    </span>
  );
}
