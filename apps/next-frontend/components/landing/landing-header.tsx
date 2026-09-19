import Link from "next/link";
import { SpreadIndicator } from "./spread-indicator";

export function LandingHeader() {
  return <header className="runhead chrome">
    <Link href="#overview" className="rh-l" aria-label="Jam Notes home"><span className="rh-full">JAM NOTES — A SPATIAL NOTEBOOK</span><span className="rh-min">JAM NOTES</span></Link>
    <SpreadIndicator />
    <nav className="rh-r" aria-label="Landing"><span className="rh-primary"><a href="#modes">MODES</a><a href="#modules">MODULES</a><a href="#beta">BETA</a><span className="rh-ed">ED. β — FREE</span></span><span className="rh-access"><Link className="sign-in" href="/login">SIGN IN</Link><Link className="mini-cta" href="/signup">START FREE</Link></span></nav>
  </header>;
}
