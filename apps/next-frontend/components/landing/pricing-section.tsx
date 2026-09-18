import Link from "next/link";

const INCLUDED = [
  "[x] unlimited notes & infinite nesting",
  "[x] canvas mode on every note",
  "[x] crash-safe autosave + draft recovery",
  "[x] ⌘K search across the workspace",
  "[ ] publishing hub — shipping next",
] as const;

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-14 border-t border-landing-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="font-landing-mono text-[13px] text-landing-accent">{"// pricing"}</p>
        <h2 className="mt-4 max-w-2xl font-landing-sans text-3xl font-semibold tracking-tight text-landing-text sm:text-4xl">
          Free while it is in beta.
        </h2>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-landing-muted sm:text-base">
          Everything below is included from day one. No seat math, no paywalled
          basics — the checkbox is the roadmap, and it is honest.
        </p>

        <div className="mt-10 max-w-2xl rounded-md border border-landing-border bg-landing-panel/40 p-7 sm:p-9">
          <p className="font-landing-mono text-[11px] uppercase tracking-widest text-landing-muted">
            {"// included"}
          </p>
          <ul className="mt-5 space-y-3 font-landing-mono text-[13px] leading-relaxed">
            {INCLUDED.map((item) => {
              const done = item.startsWith("[x]");
              const label = item.slice(4);
              return (
                <li
                  key={item}
                  className={done ? "text-landing-text" : "text-landing-muted"}
                >
                  <span className="mr-3 text-landing-accent" aria-hidden="true">
                    {item.slice(0, 3)}
                  </span>
                  {label}
                </li>
              );
            })}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-landing-border pt-6">
            <Link
              href="/signup"
              className="landing-focus rounded-sm bg-landing-accent px-6 py-3 font-landing-mono text-sm font-semibold text-landing-base transition-colors hover:bg-landing-text"
            >
              Start free
            </Link>
            <span className="font-landing-mono text-[11px] text-landing-muted">
              no card · export anytime
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
