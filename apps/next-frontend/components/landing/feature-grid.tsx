import {
  Boxes,
  Command,
  FolderTree,
  Link2,
  RefreshCw,
  Rss,
  Type,
} from "lucide-react";
import { AnimateIn } from "./animate-in";

// ── Module definitions ─────────────────────────────────────────────────────

const MODULES = [
  {
    num: "01",
    tag: "EDITOR",
    icon: Type,
    status: "Core",
    statusVariant: "accent" as const,
    title: "Block editor, slash commands",
    body: "Type / for headings, todos, code, drawings. Markdown triggers (#, -, [x]) convert as you type, and a pasted markdown doc splits itself into typed blocks.",
    metaLeft: "triggers: #, ##, -, [x], ``` ",
    metaRight: "AST parser inline",
    soon: false,
  },
  {
    num: "02",
    tag: "CANVAS",
    icon: Boxes,
    status: "Spatial",
    statusVariant: "muted" as const,
    title: "The Jam Canvas",
    body: "Flip any note into an infinite board. Drag cards around, draw connections, color-code groups, zoom and pan — with a 50-step undo stack over every gesture.",
    metaLeft: "matrix: infinite pan/zoom (0.1x to 4x)",
    metaRight: "undo buffer: 50 states",
    soon: false,
  },
  {
    num: "03",
    tag: "SYNC",
    icon: RefreshCw,
    status: "Resilient",
    statusVariant: "muted" as const,
    title: "Crash-safe autosave",
    body: "10-second idle saves with a 30-second hard cap, flushes on tab-hide and unload, plus a local draft mirror that puts itself back on the wire after a crash.",
    metaLeft: "resilience: 100% crash recovery",
    metaRight: "hard cap: 30s max lag",
    soon: false,
  },
  {
    num: "04",
    tag: "PALETTE",
    icon: Command,
    status: "Global",
    statusVariant: "muted" as const,
    title: "⌘K, everywhere",
    body: "Search the whole workspace from any screen — results deep-link straight into the note with the sidebar already open at the right place.",
    metaLeft: "latency: < 10ms indexing",
    metaRight: "fuzzy match enabled",
    soon: false,
  },
  {
    num: "05",
    tag: "TREE",
    icon: FolderTree,
    status: "Hierarchy",
    statusVariant: "muted" as const,
    title: "Infinite nesting",
    body: "Notes nest to any depth in the sidebar. Deleting a parent lifts its children up one level — nothing is ever orphaned, nothing is ever lost.",
    metaLeft: "safety: auto-lift orphan guardian",
    metaRight: "depth: unconstrained",
    soon: false,
  },
  {
    num: "06",
    tag: "PUBLISH",
    icon: Link2,
    status: "SOON",
    statusVariant: "soon" as const,
    title: "Self-publishing hub",
    body: "When a note is ready for readers, flip it public — it gets a URL at pub/you/slug, readable by anyone, no account needed. You keep editing the note behind it.",
    metaLeft: "routing: pub/you/<slug>",
    metaRight: "headless edge HTML",
    soon: true,
  },
] as const;

// ── Left sidebar: module index ─────────────────────────────────────────────

function ModuleIndex() {
  return (
    <div className="max-h-[calc(100vh-5.5rem)] overflow-y-auto overflow-x-hidden rounded-md border border-landing-border bg-landing-panel/30">
      {/* Header */}
      <div className="border-b border-landing-border px-4 py-3">
        <p className="font-landing-mono text-[9px] uppercase tracking-[0.18em] text-landing-muted">
          Module Index
        </p>
      </div>

      {/* Module list */}
      <ul>
        {MODULES.map((mod) => (
          <li
            key={mod.tag}
            className="flex items-center justify-between border-b border-landing-border/60 px-4 py-2.5 last:border-b-0"
          >
            <span className="font-landing-mono text-[11px] text-landing-muted">
              <span className="text-landing-accent">{mod.num}</span>
              {" // "}
              {mod.tag}
            </span>
            {mod.statusVariant === "soon" ? (
              <span className="rounded-[2px] border border-landing-accent/50 px-1.5 py-px font-landing-mono text-[9px] uppercase tracking-wide text-landing-accent">
                {mod.status}
              </span>
            ) : mod.statusVariant === "accent" ? (
              <span className="font-landing-mono text-[10px] text-landing-accent">
                {mod.status}
              </span>
            ) : (
              <span className="font-landing-mono text-[10px] text-landing-muted">
                {mod.status}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Verified spec footer */}
      <div className="border-t border-landing-border bg-green-950/20 px-4 py-3">
        <p className="flex items-center gap-1.5 font-landing-mono text-[10px] text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden="true" />
          Architect Verified Specs
        </p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-landing-muted">
          Zero dependencies on cloud blast. Local writes commit immediately to
          memory before dispatching to transport.
        </p>
      </div>
    </div>
  );
}

// ── Right panel: one card per module ──────────────────────────────────────

function ModuleCard({
  mod,
  index,
}: {
  mod: (typeof MODULES)[number];
  index: number;
}) {
  const Icon = mod.icon;
  return (
    <AnimateIn delay={index * 70}>
      <article className="overflow-hidden rounded-md border border-landing-border bg-landing-panel/20 transition-colors hover:border-landing-muted/50 hover:bg-landing-panel/40">
        {/* Card header row */}
        <div className="flex items-center justify-between border-b border-landing-border px-5 py-3">
          <p className="font-landing-mono text-[11px] text-landing-accent">
            {"// "}
            {mod.num} {mod.tag}
          </p>
          <span className="grid h-6 w-6 place-items-center rounded-[2px] border border-landing-border text-landing-muted transition-colors hover:border-landing-muted hover:text-landing-text">
            <Icon size={11} aria-hidden="true" />
          </span>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <h3 className="flex flex-wrap items-center gap-2 font-landing-sans text-base font-semibold text-landing-text">
            {mod.title}
            {mod.soon && (
              <span className="rounded-[2px] border border-landing-accent/40 px-1.5 py-px font-landing-mono text-[9px] lowercase tracking-normal text-landing-accent">
                soon
              </span>
            )}
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-landing-muted">
            {mod.body}
          </p>
        </div>

        {/* Metadata footer bar */}
        <div className="flex items-center justify-between border-t border-landing-border bg-landing-base/40 px-5 py-2.5">
          <span className="font-landing-mono text-[10px] text-landing-accent">
            {mod.metaLeft}
          </span>
          <span className="font-landing-mono text-[10px] text-landing-muted">
            {mod.metaRight}
          </span>
        </div>
      </article>
    </AnimateIn>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-14 border-t border-landing-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        {/* Section heading */}
        <AnimateIn>
          <p className="font-landing-mono text-[13px] text-landing-accent">
            {"// features"}
          </p>
          <h2 className="mt-4 max-w-2xl font-landing-sans text-3xl font-semibold tracking-tight text-landing-text sm:text-4xl">
            A rack of modules, not a toolbar.
          </h2>
          <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-landing-muted sm:text-base">
            Six systems doing one job: keeping your ideas where your hands are.
            Each one is wired to the same note, the same save, the same tree.
          </p>
        </AnimateIn>

        {/* Two-column layout: index sidebar + module cards */}
        <div className="mt-12 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          {/* Left: sticky module index (hidden on mobile — cards carry all info) */}
          <aside className="hidden shrink-0 lg:sticky lg:top-24 lg:block lg:w-56 xl:w-64">
            <ModuleIndex />
          </aside>

          {/* Right: stacked module cards */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {MODULES.map((mod, i) => (
              <ModuleCard key={mod.tag} mod={mod} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
