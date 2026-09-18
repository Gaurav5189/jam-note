import Link from "next/link";

const PRODUCT_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Pricing", href: "#pricing" },
  { label: "Sign in", href: "/login" },
  { label: "Start free", href: "/signup" },
] as const;

const SOURCE_LINKS = [
  { label: "GitHub", href: "https://github.com/Gaurav5189/jam-note" },
  { label: "Report an issue", href: "https://github.com/Gaurav5189/jam-note/issues" },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-landing-border">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="h-3.5 w-3.5 rounded-[2px] bg-landing-accent"
                aria-hidden="true"
              />
              <span className="font-landing-mono text-sm font-semibold tracking-tight text-landing-text">
                jam-note
              </span>
            </div>
            <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-landing-muted">
              A tactile notebook for people who build. Block editor, spatial
              canvas, self-publishing — one rack, no clutter.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-14 sm:gap-20"
          >
            <div className="flex flex-col gap-2.5">
              <span className="font-landing-mono text-[10px] uppercase tracking-widest text-landing-text/50">
                product
              </span>
              {PRODUCT_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="landing-focus w-fit font-landing-mono text-[12px] text-landing-muted transition-colors hover:text-landing-text"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-landing-mono text-[10px] uppercase tracking-widest text-landing-text/50">
                source
              </span>
              {SOURCE_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-focus w-fit font-landing-mono text-[12px] text-landing-muted transition-colors hover:text-landing-text"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-landing-border pt-6 font-landing-mono text-[11px] text-landing-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 jam-note — built for people who build.</p>
          <p className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-landing-accent"
              aria-hidden="true"
            />
            status: all systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
