import Link from "next/link";

// Marketing-only header; the authenticated workspace keeps its own Header
// component. Pure server component — just links and anchors.
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-landing-border bg-landing-base/90 backdrop-blur-xs">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="landing-focus flex items-center gap-2.5"
          aria-label="jam-note home"
        >
          <span
            className="h-3.5 w-3.5 rounded-[2px] bg-landing-accent"
            aria-hidden="true"
          />
          <span className="font-landing-mono text-sm font-semibold tracking-tight text-landing-text">
            jam-note
          </span>
        </Link>

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

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="landing-focus rounded-sm px-3 py-2 font-landing-mono text-[13px] text-landing-muted transition-colors hover:text-landing-text"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="landing-focus rounded-sm bg-landing-accent px-4 py-2 font-landing-mono text-[13px] font-semibold text-landing-base transition-colors hover:bg-landing-text"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
