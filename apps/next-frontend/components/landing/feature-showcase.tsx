"use client";

import { useRef, useState } from "react";
import { Hand, MousePointer2, Redo2, Undo2 } from "lucide-react";
import { AnimateIn } from "./animate-in";

type TabId = "editor" | "canvas" | "publish";

const TABS: { id: TabId; label: string; soon?: boolean }[] = [
  { id: "editor", label: "document" },
  { id: "canvas", label: "canvas" },
  { id: "publish", label: "publish", soon: true },
];

// ── Editor panel: miniature of the real block editor ───────────────────────

function EditorPanel() {
  return (
    <div className="absolute inset-0 p-5 font-landing-sans text-sm sm:p-7">
      <p className="text-xl font-semibold text-landing-text sm:text-2xl">
        Build log — s4/w38
      </p>

      <div className="mt-4 space-y-2.5 text-[13px] leading-relaxed">
        <p className="flex items-center gap-2.5 text-landing-text">
          <span
            className="grid h-4 w-4 shrink-0 place-items-center rounded-[2px] border border-landing-accent bg-landing-accent/25 font-landing-mono text-[10px] text-landing-accent"
            aria-hidden="true"
          >
            ✓
          </span>
          wire the autosave debounce
        </p>
        <p className="flex items-center gap-2.5 text-landing-text">
          <span
            className="h-4 w-4 shrink-0 rounded-[2px] border border-landing-border"
            aria-hidden="true"
          />
          cut the canvas beta over to production
        </p>
        <p className="flex items-center gap-2.5 text-landing-muted">
          <span className="shrink-0 text-landing-accent" aria-hidden="true">
            –
          </span>
          ship the paste parser
        </p>
      </div>

      <div className="mt-4 rounded-sm border border-landing-border bg-landing-panel/40 px-3.5 py-3 font-landing-mono text-xs leading-relaxed">
        <span className="text-landing-muted">
          {"// autosave.ts — crash-safe by construction"}
        </span>
        <br />
        <span className="text-landing-accent">flush</span>
        <span className="text-landing-text">(drafts)</span>{" "}
        <span className="text-landing-muted">
          {"// 10s idle · 30s hard cap · pagehide flush"}
        </span>
      </div>

      {/* Caret row with the slash palette open — the differentiator. */}
      <p className="mt-4 font-landing-mono text-[13px] text-landing-text">
        <span className="text-landing-accent">/</span>
        <span className="ml-px inline-block h-3.5 w-[2px] translate-y-[3px] animate-pulse bg-landing-text align-baseline" />
      </p>

      <div className="absolute bottom-5 left-5 w-44 rounded-sm border border-landing-border bg-landing-panel sm:bottom-7 sm:left-7">
        <p className="border-b border-landing-border px-3 py-2 font-landing-mono text-[10px] uppercase tracking-widest text-landing-muted">
          insert block
        </p>
        <ul className="py-1 font-landing-mono text-[12px]">
          <li className="border-l-2 border-landing-accent bg-landing-accent/10 px-3 py-1.5 text-landing-accent">
            code <span className="float-right text-landing-muted">↵</span>
          </li>
          <li className="border-l-2 border-transparent px-3 py-1.5 text-landing-muted">
            drawing
          </li>
          <li className="border-l-2 border-transparent px-3 py-1.5 text-landing-muted">
            image
          </li>
        </ul>
      </div>
    </div>
  );
}

// ── Canvas panel: miniature of the spatial board ───────────────────────────

function CanvasCard({
  tag,
  line,
  className,
}: {
  tag: string;
  line: string;
  className: string;
}) {
  return (
    <div
      className={`absolute w-[34%] rounded-sm border border-landing-border bg-landing-panel/95 p-3 shadow-[3px_3px_0_#161b2499] ${className}`}
    >
      <p className="font-landing-mono text-[10px] uppercase tracking-widest text-landing-accent">
        {tag}
      </p>
      <p className="mt-1.5 truncate text-[11px] text-landing-text/90">{line}</p>
      <p className="mt-0.5 truncate text-[11px] text-landing-muted">
        {line}
      </p>
    </div>
  );
}

function CanvasPanel() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle,#393E46_1.2px,transparent_1.6px)] bg-[size:24px_24px]">
      {/* Connections: endpoints in percentage coordinates so they track the
          cards at any panel size; non-scaling strokes keep the 1.5px width. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M 42 24 C 52 24, 52 16, 60 16"
          fill="none"
          stroke="#FFD369"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 25 40 C 25 55, 45 62, 47 72"
          fill="none"
          stroke="#4A5160"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 64 30 C 60 50, 58 60, 56 72"
          fill="none"
          stroke="#FFD369"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <CanvasCard tag="note" line="synth patch notes" className="left-[8%] top-[12%]" />
      <CanvasCard tag="note" line="launch sequence" className="left-[56%] top-[8%]" />
      <CanvasCard tag="note" line="reading queue" className="left-[26%] top-[64%]" />

      {/* HUD chips, mirroring the real canvas toolbar */}
      <span className="absolute right-3 top-3 rounded-[2px] border border-landing-border bg-landing-base/80 px-2 py-1 font-landing-mono text-[10px] text-landing-muted">
        72%
      </span>
      <div className="absolute bottom-3 left-3 flex gap-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-[2px] border border-landing-accent text-landing-accent">
          <MousePointer2 size={11} aria-hidden="true" />
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-[2px] border border-landing-border text-landing-muted">
          <Hand size={11} aria-hidden="true" />
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-[2px] border border-landing-border text-landing-muted">
          <Undo2 size={11} aria-hidden="true" />
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-[2px] border border-landing-border text-landing-muted">
          <Redo2 size={11} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

// ── Publish panel: miniature of the Phase 6 public page ────────────────────

function PublishPanel() {
  return (
    <div className="absolute inset-0">
      <div className="flex h-9 items-center gap-3 border-b border-landing-border bg-landing-panel px-4">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[#4A5160]" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[#4A5160]" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[#4A5160]" />
        </div>
        <span className="flex-1 truncate rounded-[2px] border border-landing-border bg-landing-base px-2.5 py-1 font-landing-mono text-[11px] text-landing-muted">
          jam-note.app/pub/ada/build-log
        </span>
        <span className="flex items-center gap-1.5 font-landing-mono text-[10px] uppercase tracking-widest text-landing-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-landing-accent" aria-hidden="true" />
          live
        </span>
      </div>

      <div className="max-w-[52ch] p-6 sm:p-9">
        <h3 className="font-landing-sans text-xl font-semibold text-landing-text">
          Build log — s4/w38
        </h3>
        <p className="mt-2 font-landing-mono text-[11px] text-landing-muted">
          ada — published 2026-09-18
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-landing-muted">
          Shipped the canvas undo stack this week. Fifty entries deep,
          snapshotted once per gesture — drag anything anywhere and it is still
          one Ctrl+Z away. Readers get this page at a public URL; I keep
          editing the note behind it.
        </p>
        <p className="mt-5 inline-block rounded-[2px] border border-landing-border px-2.5 py-1 font-landing-mono text-[10px] text-landing-muted">
          published with Jam Notes
        </p>
      </div>
    </div>
  );
}

const PANELS: Record<TabId, React.ReactNode> = {
  editor: <EditorPanel />,
  canvas: <CanvasPanel />,
  publish: <PublishPanel />,
};

// ── Section with a small accessible tablist ────────────────────────────────

export function FeatureShowcase() {
  const [active, setActive] = useState<TabId>("editor");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeydown = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="showcase" className="scroll-mt-14 border-t border-landing-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <AnimateIn>
          <p className="font-landing-mono text-[13px] text-landing-accent">{"// showcase"}</p>
          <h2 className="mt-4 max-w-2xl font-landing-sans text-3xl font-semibold tracking-tight text-landing-text sm:text-4xl">
            One note, three ways to work it.
          </h2>
          <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-landing-muted sm:text-base">
            Every note is a document and a spatial board at the same time — the
            same blocks, the same save, two geometries. When it is ready for
            readers, it goes public with one click.
          </p>
        </AnimateIn>

        <div
          role="tablist"
          aria-label="Product views"
          className="mt-10 flex flex-wrap gap-2"
          onKeyDown={handleKeydown}
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={`landing-focus rounded-sm border px-3.5 py-2 font-landing-mono text-[12px] uppercase tracking-widest transition-colors ${
                active === tab.id
                  ? "border-landing-accent bg-landing-accent/10 text-landing-accent"
                  : "border-landing-border text-landing-muted hover:border-landing-muted hover:text-landing-text"
              }`}
            >
              {tab.label}
              {tab.soon && (
                <span className="ml-2 rounded-[2px] border border-landing-accent/40 px-1 py-px text-[9px] lowercase tracking-normal text-landing-accent">
                  soon
                </span>
              )}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${active}`}
          aria-labelledby={`tab-${active}`}
          className="mt-4 overflow-hidden rounded-md border border-landing-border bg-landing-base"
        >
          <div className="flex h-9 items-center gap-3 border-b border-landing-border bg-landing-panel px-4">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#2a3040]" />
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#2a3040]" />
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#2a3040]" />
            </div>
            <span className="font-landing-mono text-[11px] text-landing-muted">
              {active === "editor" && "note — untitled transmission"}
              {active === "canvas" && "note — canvas view"}
              {active === "publish" && "public page preview"}
            </span>
          </div>
          {/* Crossfade between panels */}
          <div className="relative h-[400px] sm:h-[420px]">
            <div
              key={active}
              className="absolute inset-0 animate-[tab-fade-in_250ms_ease-out_both]"
            >
              {PANELS[active]}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
