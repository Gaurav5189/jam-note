import Link from "next/link";
import { AnimateIn } from "./animate-in";

const INCLUDED = [
  { label: "Unlimited notes & infinite nesting", done: true },
  { label: "Canvas mode on every note", done: true },
  { label: "Crash-safe autosave + draft recovery", done: true },
  { label: "⌘K search across the workspace", done: true },
  { label: "Publishing hub — shipping next", done: false },
] as const;

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-14 border-t border-landing-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        {/* Two-column layout */}
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
          {/* ── Left column: copy ───────────────────────────────────── */}
          <AnimateIn className="lg:max-w-sm xl:max-w-md">
            <p className="font-landing-mono text-[13px] text-landing-accent">
              {"// pricing"}
            </p>
            <h2 className="mt-4 font-landing-sans text-3xl font-semibold tracking-tight text-landing-text sm:text-4xl">
              Free while it is in beta.
            </h2>
            <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-landing-muted sm:text-base">
              Everything below is included from day one. No seat math, no
              paywalled basics — the list is the roadmap, and it is honest.
            </p>
          </AnimateIn>

          {/* ── Right column: tier card ──────────────────────────────── */}
          <AnimateIn className="flex-1" delay={120}>
            <div className="rounded-md border border-landing-border bg-landing-panel/20">
              {/* Card header */}
              <div className="border-b border-landing-border px-6 py-4">
                <p className="font-landing-mono text-[11px] uppercase tracking-widest text-landing-accent">
                  {"// Included in Beta Tier"}
                </p>
              </div>

              {/* Feature list — clean bullet style, no brackets */}
              <ul className="space-y-4 px-6 py-6">
                {INCLUDED.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-3"
                  >
                    {item.done ? (
                      /* Filled check circle for shipped features */
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-landing-accent/15 text-landing-accent"
                        aria-hidden="true"
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4l2.5 2.5L9 1"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ) : (
                      /* Hollow circle for upcoming */
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-landing-border"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`font-landing-sans text-[13px] leading-snug ${
                        item.done ? "text-landing-text" : "text-landing-muted"
                      }`}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Card footer: CTA + portability badge */}
              <div className="flex flex-col gap-4 border-t border-landing-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    href="/signup"
                    className="landing-focus rounded-full bg-landing-accent px-6 py-2.5 font-landing-mono text-sm font-semibold text-landing-base transition-all hover:bg-landing-text hover:scale-[1.03] active:scale-[0.98]"
                  >
                    Start free
                  </Link>
                  <span className="font-landing-mono text-[11px] text-landing-muted">
                    no card&nbsp;·&nbsp;export anytime
                  </span>
                </div>
                <span className="flex items-center gap-1.5 font-landing-mono text-[10px] uppercase tracking-wide text-green-400">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-green-400"
                    aria-hidden="true"
                  />
                  Portability Guaranteed (JSON/MD)
                </span>
              </div>
            </div>
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}
