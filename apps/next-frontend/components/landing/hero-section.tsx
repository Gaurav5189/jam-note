import Link from "next/link";
import { HeroCanvas } from "./hero-canvas";

const STATS = [
  { label: "keystroke to screen", value: "<50 ms" },
  { label: "keystrokes lost on a crash", value: "0" },
  { label: "jumps to any note you own", value: "⌘K" },
] as const;

// Text-first hero: the copy paints instantly, the 3D lattice streams in
// behind it after hydration (HeroCanvas owns that lazy load).
export function HeroSection() {
  return (
    <section className="relative flex min-h-[calc(100vh-3.5rem)] items-center overflow-hidden">
      <HeroCanvas />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
        <p className="font-landing-mono text-xs text-landing-accent sm:text-[13px]">
          {"// a tactile notebook for people who build"}
        </p>

        <h1 className="mt-6 max-w-3xl font-landing-sans text-5xl font-semibold leading-[1.05] tracking-tight text-landing-text sm:text-6xl lg:text-7xl">
          Write fast.
          <br />
          Think in space.
        </h1>

        <p className="mt-7 max-w-[58ch] font-landing-sans text-base leading-relaxed text-landing-muted sm:text-lg">
          A block editor that keeps up with your hands, an infinite canvas for
          the ideas that refuse to stay in line, and one-click publishing when
          the draft is ready.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/signup"
            className="landing-focus rounded-sm bg-landing-accent px-6 py-3 font-landing-mono text-sm font-semibold text-landing-base transition-colors hover:bg-landing-text"
          >
            Start free
          </Link>
          <a
            href="#showcase"
            className="landing-focus rounded-sm border border-landing-border px-6 py-3 font-landing-mono text-sm text-landing-muted transition-colors hover:border-landing-muted hover:text-landing-text"
          >
            See it work
          </a>
        </div>

        <dl className="mt-16 grid max-w-2xl grid-cols-1 divide-y divide-landing-border border border-landing-border bg-landing-base/50 backdrop-blur-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STATS.map((stat) => (
            <div key={stat.label} className="p-4 sm:p-5">
              <dt className="font-landing-mono text-[10px] uppercase tracking-widest text-landing-muted">
                {stat.label}
              </dt>
              <dd className="mt-1.5 font-landing-mono text-lg text-landing-text">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
