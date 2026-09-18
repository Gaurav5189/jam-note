import Link from "next/link";

// Marketing-only header — pure server component.
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-landing-border bg-landing-base/90 backdrop-blur-sm transition-shadow duration-300">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        {/* ── Logo ──────────────────────────────────────────────────── */}
        <Link
          href="/"
          className="landing-focus flex shrink-0 items-center gap-2"
          aria-label="Jam Notes home"
        >
          <span className="font-landing-mono text-sm font-semibold tracking-tight text-landing-text">
            Jam Notes
          </span>
        </Link>

        {/* ── Center nav ────────────────────────────────────────────── */}
        <nav
          aria-label="Landing"
          className="hidden items-center gap-7 font-landing-mono text-[12px] text-landing-muted md:flex"
        >
          <a href="#showcase" className="landing-focus transition-colors hover:text-landing-text">
            Showcase
          </a>
          <a href="#features" className="landing-focus transition-colors hover:text-landing-text">
            Features
          </a>
          <a href="#pricing" className="landing-focus transition-colors hover:text-landing-text">
            Pricing
          </a>
        </nav>

        {/* ── Right actions ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="landing-focus rounded-sm px-3 py-2 font-landing-mono text-[13px] text-landing-muted transition-colors hover:text-landing-text"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="landing-focus rounded-full bg-landing-accent px-4 py-2 font-landing-mono text-[13px] font-semibold text-landing-base transition-all hover:bg-landing-text hover:scale-[1.03] active:scale-[0.98]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
