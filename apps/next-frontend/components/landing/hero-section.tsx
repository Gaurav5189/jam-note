import Link from "next/link";

const letters = (text: string, prefix: string, delay: number, isSerif = false) =>
  [...text].map((char, index) => (
    <span
      key={`${prefix}-${index}`}
      className={`k ${char === " " ? "sp" : ""} ${isSerif ? "k-s" : ""} ${char === "." ? "kdot" : ""}`}
      style={{ "--d": `${delay + index * 0.03}s` } as React.CSSProperties}
    >
      {char === " " ? "\u00A0" : char}
    </span>
  ));

export function HeroSection() {
  return (
    <section className="spread hero" id="overview" data-ind="SPREAD 01 / 04 — OVERVIEW">
      <span className="rail rail-l chrome">JAM NOTES — A SPATIAL NOTEBOOK</span>
      <span className="rail rail-r chrome">WRITE FAST · THINK IN SPACE · ED. β</span>
      <div className="hero-core">
        <p className="kicker intro">JAM NOTES — A SPATIAL NOTEBOOK · MONOGRAPH, ED. β</p>
        <h1 className="hero-title" id="heroTitle" aria-label="Write fast. Think in space.">
          <span className="hline h1">
            <span className="hmask">
              <span className="ht">{letters("WRITE FAST.", "a", 0.12)}</span>
            </span>
          </span>
          <span className="hline h2">
            <span className="hmask">
              <span className="ht serif">{letters("Think", "b", 0.55, true)}</span>
            </span>
            <i className="h2-rule" />
          </span>
          <span className="hline h3">
            <span className="hmask">
              <span className="ht">{letters("IN SPACE.", "c", 0.82)}</span>
            </span>
          </span>
        </h1>
        <p className="hero-sub intro">A block editor that keeps up with your hands, an infinite canvas for the ideas that refuse to stay in line, and one-click publishing when the draft is ready.</p>
        <Link className="hero-console" href="/login">
          YOUR CONSOLE <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="hero-meta intro">
        <span className="meta-tech">&lt;50 MS KEYSTROKE · 0 KEYSTROKES LOST · ⌘K INSTANT</span>
        <span className="meta-c">↓</span>
        <span>
          SCROLL TO READ — 04 SPREADS <em>· ED. β — FREE WHILE IT LASTS</em>
        </span>
      </div>
    </section>
  );
}
