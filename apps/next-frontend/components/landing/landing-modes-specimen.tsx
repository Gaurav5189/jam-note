"use client";

import {
  Copy,
  Edit3,
  ExternalLink,
  GripHorizontal,
  Hand,
  Maximize2,
  MousePointer2,
  Palette,
  RotateCcw,
} from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";
import styles from "./landing-modes-specimen.module.css";

/* ==========================================================================
   LandingModesSpecimen — the "ONE NOTE, THREE WAYS" showcase
   (SPREAD 02 — MODES).

   Maintains the EXACT original monograph layout and typography:
     - Section header with .section-head, kicker "SPREAD 02 — MODES"
     - Giant headline "ONE NOTE,<br /><span class="circ">THREE</span> WAYS"
     - Subtitle dek: "Every note is a document and a spatial board at the same
       time — the same blocks, the same save, two geometries."
     - Grid layout (.modes-grid) with left monograph narrative (.modes-copy)
     - Interactive modern tactical viewport block replacing the old panel.
   ========================================================================== */

type Mode = "DOCUMENT" | "CANVAS" | "PUBLISH";

const MODES: { id: Mode; label: string; soon?: boolean }[] = [
  { id: "DOCUMENT", label: "DOCUMENT" },
  { id: "CANVAS", label: "CANVAS" },
  { id: "PUBLISH", label: "PUBLISH", soon: true },
];

/** Left-panel narrative, keyed by the active mode. */
const MODE_COPY: Record<
  Mode,
  { kicker: string; body: string }
> = {
  DOCUMENT: {
    kicker: "THE SAME THOUGHT / THREE SURFACES",
    body:
      "Write linearly, arrange spatially, then publish the draft when it is ready. No export step, no duplicate source.",
  },
  CANVAS: {
    kicker: "SPATIAL FIELD / 2D GEOMETRY",
    body:
      "Explode the linear document into an infinite 2D graph. Drag cards, connect ideas with live SVG wires, and map out complex systems.",
  },
  PUBLISH: {
    kicker: "PUBLIC SPECIMEN / ONE-CLICK",
    body:
      "Turn any note into a public web page with one click. Custom public URL, clean reader UI, zero export steps, and zero build delays.",
  },
};

/** Document-view blocks mirroring the actual dashboard note (Image 3). */
const DOCUMENT_BLOCKS: {
  type: "h1" | "h2" | "h3" | "p" | "code";
  text: string;
}[] = [
  {
    type: "h1",
    text:
      "P ≠ NP: The Fifty-Year Wall, Fine-Grained Science, Cryptography's Foundation, and the World After a Collapse",
  },
  {
    type: "p",
    text:
      "In 1971, Stephen Cook proved that Boolean satisfiability (SAT) is NP-hard — every problem whose solutions can be checked in polynomial time can be encoded as a SAT instance. Leonid Levin independently formulated the same question (published 1973), and in 1972 Richard Karp showed that 21 classical combinatorial problems — Hamiltonian cycle, Traveling Salesman, Clique, Subset Sum — are all polynomial-time reducible to SAT.",
  },
  {
    type: "p",
    text:
      "One question absorbed them all: is P = NP? If any single NP-complete problem has a polynomial-time algorithm, then every NP-complete problem does. The Clay Mathematics Institute put US$1,000,000 on the answer in 2000. Fifty-plus years later, neither side has moved: no polynomial-time algorithm for any NP-complete problem has been found, and no superpolynomial lower bound for any explicit function against unrestricted circuits.",
  },
  { type: "h2", text: "1. Why Can't We Prove It?" },
  {
    type: "h3",
    text: "1.1 The embarrassingly low ceiling of circuit lower bounds",
  },
  {
    type: "p",
    text:
      "P vs NP is, at its core, a lower-bound problem: show that SAT requires superpolynomial-size circuits. The ground truth is stark. Shannon's 1949 counting argument shows that almost all Boolean functions on n inputs require roughly 2^n/n gates — yet for any explicit function in NP, the best known lower bound against unrestricted circuits is 5n - o(n).",
  },
  {
    type: "code",
    text:
      "Theorem[1971]. CookSAT is NP-complete.\n  ∀ L ∈ NP, L ≤_p CookSAT.\n  Proof. Reduce any L ∈ NP to SAT via\n    the tableau of the verifier V.\n  ∴ P = NP ⇒ ∃ poly-time SAT solver.\n  Open 55 years running.",
  },
];

const BLOCK_COUNT = 115;
const LINK_COUNT = 7;
const PUBLISH_URL = "https://jam.notes/pub/gaurav/p-vs-np";

/* Inline button styles to defeat the .landing CSS button resets */
const TAB_STYLE = (active: boolean): CSSProperties => ({
  border: "1.5px solid #2a2f3d",
  background: active ? "#2a2f3d" : "transparent",
  color: active ? "#ffffff" : "#8a94a6",
  fontFamily: "var(--font-space-mono)",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  cursor: "pointer",
});

const ICON_BTN_STYLE: CSSProperties = {
  border: "1px solid #2a2f3d",
  background: "transparent",
  color: "#8a94a6",
  cursor: "pointer",
};

export function LandingModesSpecimen() {
  const [activeMode, setActiveMode] = useState<Mode>("CANVAS");
  const [zoom, setZoom] = useState(89);
  const [copied, setCopied] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const updateZoom = (delta: number) => {
    setZoom((value) => Math.min(140, Math.max(50, value + delta)));
  };

  const copyUrl = () => {
    void navigator.clipboard.writeText(PUBLISH_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  /* Arrow-key navigation across the segmented tabs */
  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = MODES.findIndex((m) => m.id === activeMode);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % MODES.length;
    if (event.key === "ArrowLeft")
      next = (index - 1 + MODES.length) % MODES.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = MODES.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setActiveMode(MODES[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="spread modes" id="modes">
      <span className="folio-n">02</span>
      <div className="wrap">
        {/* Exact initial section header layout */}
        <div className="section-head" data-reveal data-drift>
          <p className="kicker">SPREAD 02 — MODES</p>
          <h2 className="h-xl">
            ONE NOTE,
            <br />
            <span className="circ">THREE</span> WAYS
          </h2>
          <p className="dek">
            Every note is a document and a spatial board at the same time — the
            same blocks, the same save, two geometries.
          </p>
        </div>

        {/* Exact initial 2-column layout */}
        <div className="modes-grid" data-reveal>
          {/* Left: Monograph narrative copy */}
          <div className="modes-copy">
            <p className="note-m">{MODE_COPY[activeMode].kicker}</p>
            <p className="dek">{MODE_COPY[activeMode].body}</p>
          </div>

          {/* Right: Tactical Specimen Viewport */}
          <div className={styles.viewportFrame}>
            {/* Specimen header: document title + segmented switcher */}
            <div className={styles.specimenHeader}>
              <div className="flex items-center gap-2">
                <span className="block h-2 w-2 animate-pulse rounded-full bg-[#00F0FF]" />
                <span
                  className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-200"
                  style={{ fontFamily: "var(--font-space-mono)" }}
                >
                  P vs NP ✏️
                </span>
              </div>

              <nav
                className={styles.tabsRail}
                role="tablist"
                aria-label="Note render modes"
                onKeyDown={navigateTabs}
              >
                {MODES.map((mode, i) => {
                  const isActive = activeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      ref={(node) => {
                        tabRefs.current[i] = node;
                      }}
                      id={`mode-${mode.id.toLowerCase()}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="mode-panel"
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveMode(mode.id)}
                      style={TAB_STYLE(isActive)}
                      className="px-3.5 py-1.5 hover:opacity-90 transition-colors"
                    >
                      {mode.label}
                      {mode.soon && (
                        <i className="ml-1 text-[8px] font-normal not-italic text-[#ff3d1c]">
                          SOON
                        </i>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Specimen body: three always-mounted panes cross-fade */}
            <div
              className={styles.viewportBody}
              id="mode-panel"
              aria-live="polite"
              aria-relevant="additions text"
            >
              <div
                className={
                  activeMode === "DOCUMENT"
                    ? styles.pane
                    : `${styles.pane} ${styles.paneHidden}`
                }
                aria-hidden={activeMode !== "DOCUMENT"}
              >
                <DocumentModeView />
              </div>

              <div
                className={
                  activeMode === "CANVAS"
                    ? styles.pane
                    : `${styles.pane} ${styles.paneHidden}`
                }
                aria-hidden={activeMode !== "CANVAS"}
              >
                <CanvasSpecimenView zoom={zoom} onZoom={updateZoom} />
              </div>

              <div
                className={
                  activeMode === "PUBLISH"
                    ? styles.pane
                    : `${styles.pane} ${styles.paneHidden}`
                }
                aria-hidden={activeMode !== "PUBLISH"}
              >
                <PublishSpecimenView copied={copied} onCopy={copyUrl} />
              </div>
            </div>

            {/* Viewport footer telemetry */}
            <div className={styles.specimenFooter}>
              <span>
                STATUS:{" "}
                <span className="text-[#00F0FF]">RENDER_OK</span>
              </span>
              <span>GEOMETRY: {activeMode}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
   DOCUMENT 01 — high-contrast dark reading column matching Image 3.
   ────────────────────────────────────────────────────────────────────────── */

function DocumentModeView() {
  return (
    <div className={styles.docScroll}>
      <div className="mx-auto max-w-[75ch] px-6 py-6 text-[#e5e7eb]">
        {DOCUMENT_BLOCKS.map((block, i) => {
          const handleId = `doc-block-${i}`;
          if (block.type === "h1")
            return (
              <div
                key={handleId}
                className={`${styles.docRow} mb-4 pb-3 border-b border-[#2a2f3d]`}
              >
                <span
                  className={`${styles.docHandle} mr-2 font-mono text-[10px] font-bold text-[#ff3d1c]`}
                  aria-hidden="true"
                >
                  :::
                </span>
                <div
                  className="text-2xl font-extrabold leading-snug tracking-tight text-[#ffffff] sm:text-3xl"
                  style={{ fontFamily: "var(--font-archivo)" }}
                >
                  {block.text}
                </div>
                <p
                  className="mt-2 text-xs text-[#8a94a6] font-mono"
                  style={{ fontFamily: "var(--font-space-mono)" }}
                >
                  Updated 2 hours ago · 1,120 words · ⌘K quick switcher
                </p>
              </div>
            );
          if (block.type === "h2")
            return (
              <h2
                key={handleId}
                className={`${styles.docRow} mb-2 mt-6 text-xl font-bold leading-snug text-[#f3f4f6]`}
                style={{ fontFamily: "var(--font-archivo)" }}
              >
                <span
                  className={`${styles.docHandle} mr-2 font-mono text-[10px] font-bold text-[#ff3d1c]`}
                  aria-hidden="true"
                >
                  :::
                </span>
                {block.text}
              </h2>
            );
          if (block.type === "h3")
            return (
              <h3
                key={handleId}
                className={`${styles.docRow} mb-2 mt-4 text-base font-bold leading-snug text-[#e5e7eb]`}
                style={{ fontFamily: "var(--font-archivo)" }}
              >
                <span
                  className={`${styles.docHandle} mr-2 font-mono text-[10px] font-bold text-[#ff3d1c]`}
                  aria-hidden="true"
                >
                  :::
                </span>
                {block.text}
              </h3>
            );
          if (block.type === "code")
            return (
              <pre
                key={handleId}
                className="my-4 overflow-x-auto border border-[#2a2f3d] bg-[#14161c] p-3 text-xs leading-relaxed text-[#00f0ff] font-mono"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                <code>{block.text}</code>
              </pre>
            );
          return (
            <p
              key={handleId}
              className={`${styles.docRow} mb-3.5 text-sm leading-relaxed text-[#d1d5db]`}
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              <span
                className={`${styles.docHandle} mr-2 font-mono text-[10px] font-bold text-[#ff3d1c]`}
                aria-hidden="true"
              >
                :::
              </span>
              {block.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
   CANVAS 02 — 2D spatial graph with cards and exact SVG cubic Bezier wires
   matching the real dashboard canvas note (Image 4).
   ────────────────────────────────────────────────────────────────────────── */

/* Exact SVG wires and midpoint circular handles connecting card edge ports */
const CANVAS_WIRES_DEF = [
  // 1. Header-1 right edge (400, 57) -> Text card left edge (440, 183)
  {
    path: "M 400 57 C 450 57, 390 183, 440 183",
    midX: 420,
    midY: 120,
  },
  // 2. Header-1 bottom center (295, 98) -> Header-2 top center (295, 148)
  {
    path: "M 295 98 C 295 123, 295 123, 295 148",
    midX: 295,
    midY: 123,
  },
  // 3. Header-2 left edge (200, 184) -> Header-3 (lower bounds) right edge (170, 220)
  {
    path: "M 200 184 C 170 184, 200 220, 170 220",
    midX: 185,
    midY: 202,
  },
  // 4. Header-2 bottom center (295, 220) -> Header-3 (relativization) top center (295, 270)
  {
    path: "M 295 220 C 295 245, 295 245, 295 270",
    midX: 295,
    midY: 245,
  },
  // 5. Header-1 bottom left (93, 98) -> Header-3 (lower bounds) top center (93, 180)
  {
    path: "M 93 98 C 93 139, 93 139, 93 180",
    midX: 93,
    midY: 139,
  },
];

function CanvasSpecimenView({
  zoom,
  onZoom,
}: {
  zoom: number;
  onZoom: (delta: number) => void;
}) {
  return (
    <div className={styles.canvasGrid}>
      {/* Top-Right: Tool selector floating pill [ ↖ POINTER | ✋ HAND ] */}
      <div
        className="absolute top-3 right-3 z-30 flex items-center bg-[#0d0e11] border border-[#2a2f3d] p-0.5 text-[10px] font-mono uppercase"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        <div
          className="flex items-center gap-1 px-2.5 py-1 text-[#0D0E11] font-bold"
          style={{ background: "#00F0FF" }}
          title="Pointer mode (drag cards, connect)"
          aria-label="Pointer mode"
        >
          <MousePointer2 size={11} />
          <span>POINTER</span>
        </div>
        <div
          className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-slate-200"
          style={{ cursor: "pointer" }}
          title="Hand mode (pan view)"
          aria-label="Hand mode"
        >
          <Hand size={11} />
          <span>HAND</span>
        </div>
      </div>

      {/* Scaled world coordinate space: cards + SVG wires scale together */}
      <div
        className={styles.canvasWorld}
        style={{ transform: `scale(${zoom / 100})` }}
        aria-label="Canvas field"
      >
        {/* SVG connection vectors with 1:1 pixel coordinate alignment */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none z-0"
          fill="none"
        >
          {CANVAS_WIRES_DEF.map((wire, i) => (
            <g key={`wire-group-${i}`}>
              {/* Cubic Bezier wire */}
              <path
                d={wire.path}
                stroke="#00F0FF"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.85"
              />
              {/* Midpoint interactive circle dot */}
              <circle
                cx={wire.midX}
                cy={wire.midY}
                r="3.5"
                fill="#00F0FF"
                stroke="#0D0E11"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>

        {/* ── CARD 1: Main Header (HEADER-1) ── */}
        <div
          className={styles.nodeCard}
          style={{
            left: "20px",
            top: "16px",
            width: "380px",
            height: "82px",
            zIndex: 10,
          }}
        >
          <div
            className={styles.nodeHeader}
            style={{ background: "#FF3D1C" }}
          >
            <div className="flex items-center gap-1.5">
              <GripHorizontal size={10} className="opacity-80" />
              <span>::: HEADER-1</span>
            </div>
            <div className="flex items-center gap-1 opacity-80">
              <Palette size={9} />
              <Edit3 size={9} />
            </div>
          </div>
          <div className="p-2.5">
            <div
              className="text-xs font-extrabold leading-tight text-[#151310]"
              style={{ fontFamily: "var(--font-archivo)" }}
            >
              P ≠ NP: The Fifty-Year Wall, Fine-Grained Science,
              Cryptography&apos;s Foundation, and the World After a Collapse
            </div>
          </div>

          {/* Connection edge port dots */}
          {/* Right edge port (connected to Text card) at y=57px (top: 41px) */}
          <span
            className="absolute top-[41px] right-0 translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
          {/* Bottom center-right port (connected to Header-2) at x=295px (left: 275px) */}
          <span
            className="absolute bottom-0 left-[275px] -translate-x-1/2 translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
          {/* Bottom left port (connected to Header-3) at x=93px (left: 73px) */}
          <span
            className="absolute bottom-0 left-[73px] -translate-x-1/2 translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
        </div>

        {/* ── CARD 2: Sub Header (HEADER-2) ── */}
        <div
          className={styles.nodeCard}
          style={{
            left: "200px",
            top: "148px",
            width: "190px",
            height: "72px",
            zIndex: 10,
          }}
        >
          <div
            className={styles.nodeHeader}
            style={{ background: "#2A2F3D" }}
          >
            <div className="flex items-center gap-1.5 text-slate-200">
              <GripHorizontal size={10} className="opacity-80" />
              <span>::: HEADER-2</span>
            </div>
            <div className="flex items-center gap-1 opacity-80 text-slate-200">
              <Palette size={9} />
              <Edit3 size={9} />
            </div>
          </div>
          <div className="p-2.5">
            <h2
              className="text-xs font-extrabold leading-tight text-[#151310]"
              style={{ fontFamily: "var(--font-archivo)" }}
            >
              1. Why Can&apos;t We Prove It?
            </h2>
          </div>

          {/* Top center port at x=295px (left: 95px) */}
          <span
            className="absolute top-0 left-[95px] -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
          {/* Left edge port at y=184px (top: 36px) */}
          <span
            className="absolute top-[36px] left-0 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
          {/* Bottom center port at x=295px (left: 95px) */}
          <span
            className="absolute bottom-0 left-[95px] -translate-x-1/2 translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
        </div>

        {/* ── CARD 3: Lower Bounds (HEADER-3) ── */}
        <div
          className={styles.nodeCard}
          style={{
            left: "16px",
            top: "180px",
            width: "154px",
            height: "80px",
            zIndex: 10,
          }}
        >
          <div
            className={styles.nodeHeader}
            style={{ background: "#2A2F3D" }}
          >
            <div className="flex items-center gap-1 text-slate-200">
              <GripHorizontal size={10} className="opacity-80" />
              <span>::: HEADER-3</span>
            </div>
          </div>
          <div className="p-2">
            <h3
              className="text-[11px] font-extrabold leading-tight text-[#151310]"
              style={{ fontFamily: "var(--font-archivo)" }}
            >
              1.1 The embarrassingly low ceiling of circuit lower bounds
            </h3>
          </div>

          {/* Top center port at x=93px (left: 77px) */}
          <span
            className="absolute top-0 left-[77px] -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
          {/* Right edge port at y=220px (top: 40px) */}
          <span
            className="absolute top-[40px] right-0 translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
        </div>

        {/* ── CARD 4: Relativization (HEADER-3) ── */}
        <div
          className={styles.nodeCard}
          style={{
            left: "200px",
            top: "270px",
            width: "190px",
            height: "76px",
            zIndex: 10,
          }}
        >
          <div
            className={styles.nodeHeader}
            style={{ background: "#2A2F3D" }}
          >
            <div className="flex items-center gap-1 text-slate-200">
              <GripHorizontal size={10} className="opacity-80" />
              <span>::: HEADER-3</span>
            </div>
          </div>
          <div className="p-2">
            <h3
              className="text-[11px] font-extrabold leading-tight text-[#151310]"
              style={{ fontFamily: "var(--font-archivo)" }}
            >
              1.2 Barrier I: Relativization (Baker–Gill–Solovay, 1975)
            </h3>
          </div>

          {/* Top center port at x=295px (left: 95px) */}
          <span
            className="absolute top-0 left-[95px] -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
        </div>

        {/* ── CARD 5: Article Paragraph (TEXT BLOCK) ── */}
        <div
          className={styles.nodeCard}
          style={{
            left: "440px",
            top: "120px",
            width: "190px",
            height: "190px",
            zIndex: 10,
          }}
        >
          <div
            className={styles.nodeHeader}
            style={{ background: "#2A2F3D" }}
          >
            <div className="flex items-center gap-1 text-slate-200">
              <GripHorizontal size={10} className="opacity-80" />
              <span>::: TEXT</span>
            </div>
            <div className="flex items-center gap-1 opacity-80 text-slate-200">
              <Palette size={9} />
              <Edit3 size={9} />
            </div>
          </div>
          <div className="p-2.5 overflow-hidden">
            <p
              className="text-[10px] leading-relaxed text-[#151310]/90"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              In 1971, Stephen Cook proved that Boolean satisfiability (SAT) is
              NP-hard — every problem whose solutions can be checked in
              polynomial time can be encoded as a SAT instance. Leonid Levin
              independently formulated the same question (published 1973)...
            </p>
          </div>

          {/* Left edge port at y=183px (top: 63px) */}
          <span
            className="absolute top-[63px] left-0 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#00F0FF] border border-[#151310]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Bottom telemetry bar & Zoom controls */}
      <div
        className="absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between text-[10px] font-mono uppercase"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        <span
          className="px-2.5 py-1.5 text-slate-300 flex items-center gap-1.5"
          style={{ border: "1px solid #2a2f3d", background: "#14161c" }}
        >
          <span className="h-1.5 w-1.5 bg-[#ff3d1c]" />
          {BLOCK_COUNT} BLOCKS · {LINK_COUNT} LINKS · POINTER MODE · DRAG CARDS
        </span>
        <span
          className="flex items-center gap-1 text-slate-300"
          style={{
            border: "1px solid #2a2f3d",
            background: "#14161c",
            padding: "2px 6px",
          }}
        >
          <button
            type="button"
            onClick={() => onZoom(-7)}
            style={ICON_BTN_STYLE}
            className="px-1.5 py-0.5 hover:opacity-90"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="px-1 text-[#00f0ff]">{zoom}%</span>
          <button
            type="button"
            onClick={() => onZoom(7)}
            style={ICON_BTN_STYLE}
            className="px-1.5 py-0.5 hover:opacity-90"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => onZoom(89 - zoom)}
            style={ICON_BTN_STYLE}
            className="px-1.5 py-0.5 hover:opacity-90"
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <RotateCcw size={10} />
          </button>
          <button
            type="button"
            style={ICON_BTN_STYLE}
            className="px-1.5 py-0.5 hover:opacity-90"
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Maximize2 size={10} />
          </button>
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
   PUBLISH 03 — public web article preview with high-contrast reader card
   ────────────────────────────────────────────────────────────────────────── */

function PublishSpecimenView({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className="h-full w-full p-4 space-y-3 overflow-y-auto"
      style={{ backgroundColor: "#0D0E11" }}
    >
      {/* Top Browser Address Bar */}
      <div
        className="flex items-center justify-between px-3.5 py-2 text-xs"
        style={{
          border: "1.5px solid #2a2f3d",
          background: "#14161c",
          fontFamily: "var(--font-space-mono)",
        }}
      >
        <div className="flex items-center gap-2 text-slate-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#00F0FF]" />
          <span className="text-slate-200">jam.notes/pub/gaurav/p-vs-np</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold"
            style={{
              border: "1px solid rgba(0,240,255,0.3)",
              background: "rgba(0,240,255,0.1)",
              color: "#00F0FF",
            }}
          >
            LIVE
          </span>
          {copied ? (
            <span className="text-[10px] text-[#00f0ff] font-mono">COPIED</span>
          ) : (
            <button
              type="button"
              onClick={onCopy}
              style={{
                border: "1px solid #2a2f3d",
                background: "#0d0e11",
                color: "#00f0ff",
                fontFamily: "var(--font-space-mono)",
                cursor: "pointer",
              }}
              className="px-2 py-0.5 text-[10px] font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
              aria-label="Copy public URL"
            >
              <Copy size={10} /> COPY LINK
            </button>
          )}
        </div>
      </div>

      {/* High-Contrast Article Paper Card */}
      <div
        className="space-y-3 p-6"
        style={{
          border: "2px solid #151310",
          background: "#FAF7EF",
          boxShadow: "4px 4px 0 #151310",
          maxHeight: "310px",
          overflowY: "auto",
          scrollbarWidth: "thin",
        }}
      >
        {/* Red attribution badge */}
        <div
          className="inline-block px-2 py-0.5 text-[9px] font-bold text-white uppercase"
          style={{
            fontFamily: "var(--font-space-mono)",
            background: "#FF3D1C",
          }}
        >
          [ 00 AUTHOR ATTRIBUTION ]
        </div>

        <div
          className="text-2xl font-extrabold text-[#151310] leading-snug tracking-tight"
          style={{ fontFamily: "var(--font-archivo)" }}
        >
          P ≠ NP: The Fifty-Year Wall, Fine-Grained Science, Cryptography&apos;s
          Foundation, and the World After a Collapse
        </div>

        <p
          className="text-xs text-[#151310]/70"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          By Gaurav Sethi · Published Sep 26, 2026 · 4 min read ·{" "}
          <span className="inline-flex items-center gap-1 font-bold text-[#ff3d1c]">
            <ExternalLink size={10} /> 1,420 VIEWS
          </span>
        </p>

        <div
          className="pt-1 space-y-3 text-xs leading-relaxed"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          <p className="text-[#151310]">
            In 1971, Stephen Cook proved that Boolean satisfiability (SAT) is
            NP-hard — every problem whose solutions can be checked in
            polynomial time can be encoded as a SAT instance.
          </p>
          <p className="text-[#151310]">
            Fifty-plus years later, neither side has moved: no polynomial-time
            algorithm for any NP-complete problem has been found, yet a proof
            remains out of reach.
          </p>
        </div>

        <footer
          className="border-t pt-3 text-right"
          style={{ borderColor: "#151310", color: "#151310" }}
        >
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            <ExternalLink size={10} />
            View on jam.notes
          </span>
        </footer>
      </div>
    </div>
  );
}
