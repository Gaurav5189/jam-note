import { Boxes, Command, FolderTree, Rss, Save, Type } from "lucide-react";

const MODULES = [
  {
    tag: "editor",
    icon: Type,
    title: "Block editor, slash commands",
    body: "Type / for headings, todos, code, drawings. Markdown triggers (#, -, [x]) convert as you type, and a pasted markdown doc splits itself into typed blocks.",
    soon: false,
  },
  {
    tag: "canvas",
    icon: Boxes,
    title: "The Jam Canvas",
    body: "Flip any note into an infinite board. Drag cards around, draw connections, color-code groups, zoom and pan — with a 50-step undo stack over every gesture.",
    soon: false,
  },
  {
    tag: "sync",
    icon: Save,
    title: "Crash-safe autosave",
    body: "10-second idle saves with a 30-second hard cap, flushes on tab-hide and unload, plus a local draft mirror that puts itself back on the wire after a crash.",
    soon: false,
  },
  {
    tag: "palette",
    icon: Command,
    title: "⌘K, everywhere",
    body: "Search the whole workspace from any screen — results deep-link straight into the note with the sidebar already open at the right place.",
    soon: false,
  },
  {
    tag: "tree",
    icon: FolderTree,
    title: "Infinite nesting",
    body: "Notes nest to any depth in the sidebar. Deleting a parent lifts its children up one level — nothing is ever orphaned, nothing is ever lost.",
    soon: false,
  },
  {
    tag: "publish",
    icon: Rss,
    title: "Self-publishing hub",
    body: "When a note is ready for readers, flip it public — it gets a URL at pub/you/slug, readable by anyone, no account needed. You keep editing the note behind it.",
    soon: true,
  },
] as const;

// Rack-module rows instead of a card grid: audio-rack vernacular, hairline
// separated, one module per row — reads like the front panel of the product.
export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-14 border-t border-landing-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="font-landing-mono text-[13px] text-landing-accent">{"// features"}</p>
        <h2 className="mt-4 max-w-2xl font-landing-sans text-3xl font-semibold tracking-tight text-landing-text sm:text-4xl">
          A rack of modules, not a toolbar.
        </h2>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-landing-muted sm:text-base">
          Six systems doing one job: keeping your ideas where your hands are.
          Each one is wired to the same note, the same save, the same tree.
        </p>

        <ul className="mt-12 border-t border-landing-border">
          {MODULES.map((module) => (
            <li
              key={module.tag}
              className="group flex flex-col gap-3 border-b border-landing-border py-7 sm:flex-row sm:items-start sm:gap-8"
            >
              <span className="w-24 shrink-0 pt-1 font-landing-mono text-[11px] uppercase tracking-widest text-landing-accent transition-colors group-hover:text-landing-text">
                {"// "}
                {module.tag}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="flex flex-wrap items-center gap-2.5 font-landing-sans text-lg font-semibold text-landing-text">
                  {module.title}
                  {module.soon && (
                    <span className="rounded-[2px] border border-landing-accent/40 px-1.5 py-px font-landing-mono text-[10px] lowercase tracking-normal text-landing-accent">
                      soon
                    </span>
                  )}
                </h3>
                <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-landing-muted">
                  {module.body}
                </p>
              </div>
              <module.icon
                size={18}
                className="shrink-0 text-landing-muted transition-colors group-hover:text-landing-text"
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
