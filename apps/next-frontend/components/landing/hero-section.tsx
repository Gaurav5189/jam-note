import Link from "next/link";
import { HeroCanvas } from "./hero-canvas";
import { AnimateIn } from "./animate-in";

const STATS = [
  {
    label: "keystroke to screen",
    value: "<50 ms",
    dot: "bg-landing-accent",
    badge: null,
  },
  {
    label: "keystrokes lost on a crash",
    value: "0",
    dot: "bg-green-400",
    badge: null,
  },
  {
    label: "jumps to any note you own",
    value: "⌘K",
    dot: null,
    badge: "INSTANT",
  },
] as const;

// Text-first hero: copy paints instantly; the 3D lattice streams in behind
// it after hydration (HeroCanvas owns that lazy load).
// Layout is center-aligned matching the reference design.
export function HeroSection() {
  return (
    <section className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden">
      <HeroCanvas />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-24 text-center sm:px-8">
        {/* Pill tagline */}
        <AnimateIn>
          <p className="inline-flex items-center gap-2 rounded-full border border-landing-border bg-landing-panel/60 px-4 py-1.5 font-landing-mono text-xs text-landing-accent backdrop-blur-sm sm:text-[13px]">
            {"// a tactile notebook for people who build"}
          </p>
        </AnimateIn>

        {/* Headline */}
        <AnimateIn delay={80}>
          <h1 className="mt-8 font-landing-sans text-5xl font-semibold leading-[1.05] tracking-tight text-landing-text sm:text-6xl lg:text-7xl">
            Write fast.
            <br />
            Think in space.
          </h1>
        </AnimateIn>

        {/* Sub-copy */}
        <AnimateIn delay={150}>
          <p className="mx-auto mt-7 max-w-[56ch] font-landing-sans text-base leading-relaxed text-landing-muted sm:text-lg">
            A block editor that keeps up with your hands, an infinite canvas for
            the ideas that refuse to stay in line, and one-click publishing when
            the draft is ready.
          </p>
        </AnimateIn>

        {/* CTAs */}
        <AnimateIn delay={220}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="landing-focus rounded-full bg-landing-accent px-7 py-3 font-landing-mono text-sm font-semibold text-landing-base transition-all hover:bg-landing-text hover:scale-[1.04] active:scale-[0.97]"
            >
              Start free
            </Link>
            <a
              href="#showcase"
              className="landing-focus rounded-full border border-landing-border px-7 py-3 font-landing-mono text-sm text-landing-muted transition-colors hover:border-landing-muted hover:text-landing-text"
            >
              See it work
            </a>
          </div>
        </AnimateIn>

        {/* Stats bar */}
        <AnimateIn delay={320}>
          <dl className="mx-auto mt-16 grid max-w-2xl grid-cols-1 divide-y divide-landing-border overflow-hidden rounded-md border border-landing-border bg-landing-base/60 backdrop-blur-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between p-4 sm:block sm:p-5"
              >
                <div>
                  <dt className="font-landing-mono text-[10px] uppercase tracking-widest text-landing-muted">
                    {stat.label}
                  </dt>
                  <dd className="mt-1.5 font-landing-mono text-lg text-landing-text">
                    {stat.value}
                  </dd>
                </div>
                {/* Dot or INSTANT badge */}
                {stat.dot && (
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full sm:hidden ${stat.dot}`}
                    aria-hidden="true"
                  />
                )}
                {stat.badge && (
                  <span className="shrink-0 rounded-[3px] border border-landing-accent/60 px-1.5 py-0.5 font-landing-mono text-[9px] font-semibold uppercase tracking-wider text-landing-accent sm:mt-2 sm:inline-block">
                    {stat.badge}
                  </span>
                )}
              </div>
            ))}
            {/* Separator dots shown only on sm+ between the stat cells */}
            {/* (handled via divide-x above) */}
          </dl>
        </AnimateIn>
      </div>
    </section>
  );
}
