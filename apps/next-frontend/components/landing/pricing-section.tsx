"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { inkBurst } from "./feedback";

const terms = [
  ["Unlimited notes & infinite nesting", "no ceilings, no counts"],
  ["The whole rack — every module", "nothing held back"],
  ["Local-first · your notes are files", "plain, portable, yours"],
  ["Instant search across everything", "before you finish typing"],
  ["Export to Markdown, anytime", "no lock-in, ever"],
  ["Offline-first sync", "when you say so"],
] as const;

function Scissors() {
  return <svg viewBox="0 0 24 14" aria-hidden="true"><circle cx="5" cy="4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="5" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7.4 5 21 12M7.4 9 21 2" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function Barcode() {
  return <svg viewBox="0 0 120 26" aria-hidden="true" fill="currentColor"><path d="M0 0h2.6v26H0zM5 0h1.4v26H5zM9.4 0h3.2v26H9.4zM15 0h1.4v26H15zM18.6 0h2.2v26h-2.2zM23.4 0h1.4v26h-1.4zM26.8 0h3.4v26h-3.4zM32.4 0h1.4v26h-1.4zM35.8 0h2.2v26h-2.2zM40.4 0h1.4v26h-1.4zM44 0h3.2v26H44zM49.6 0h1.4v26h-1.4zM53 0h2.2v26H53zM57.6 0h1.4v26h-1.4zM61 0h3.4v26H61zM67 0h1.4v26h-1.4zM70.4 0h2.2v26h-2.2zM75 0h1.4v26h-1.4zM78.6 0h3.2v26h-3.2zM84.2 0h1.4v26h-1.4zM87.6 0h2.2v26h-2.2zM92.2 0h1.4v26h-1.4zM95.8 0h3.4v26h-3.4zM101.6 0h1.4v26h-1.4zM105 0h2.2v26h-2.2zM109.6 0h1.4v26h-1.4zM113 0h3.2v26h-3.2zM118.4 0h1.6v26h-1.6z" /></svg>;
}

export function PricingSection() {
  const router = useRouter();
  const [clipped, setClipped] = useState(false);
  const [countdown, setCountdown] = useState(3);
  useEffect(() => { router.prefetch("/signup"); }, [router]);
  useEffect(() => {
    if (!clipped) return;
    const interval = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    const redirect = window.setTimeout(() => router.push("/signup"), 3000);
    return () => { window.clearInterval(interval); window.clearTimeout(redirect); };
  }, [clipped, router]);
  const claim = () => {
    if (clipped) return;
    setCountdown(3);
    setClipped(true);
    inkBurst(innerWidth * 0.7, innerHeight * 0.7);
  };

  return <section className="spread beta" id="beta">
    <span className="folio-n">04</span>
    <div className="wrap">
      <div data-reveal data-drift><p className="kicker">SPREAD 04 — TERMS</p><h2 className="h-xl">FREE WHILE<br />IT IS IN BETA<span className="acc">.</span></h2></div>
      <div className="beta-grid" data-reveal>
        <div><div className="price"><span className="big">FREE</span><sup className="ast">*</sup></div><p className="price-note">While the beta lasts. No card, no clock, no drip pricing. When beta ends you keep every note — and the price stays honest.</p></div>
        <div>
          <ul className="terms">{terms.map(([title, note], index) => <li className="term" key={title}><i>{String(index + 1).padStart(2, "0")}</i><b>{title}</b><span>{note}</span></li>)}</ul>
          <button className={`coupon ${clipped ? "is-clipped" : ""}`} aria-disabled={clipped} onClick={claim}>
            <span className="cp-cut"><Scissors />NO. 000042 — VALID WHILE β</span>
            <span className="cp-row"><span className="cp-main"><span className="cp-claim">CLIP THIS COUPON —<br />START WRITING</span>{clipped && <span className="cp-said" role="status" aria-live="polite">CLIPPED — SEE YOU<br />IN THE BETA {countdown}..</span>}</span><span className="cp-code"><Barcode /><span>8 4JAM2 βETA9</span></span></span>
            <strong className="cp-stamp">CLAIMED</strong>
          </button>
          <p className="after-line">AFTER BETA — HONEST PRICING · EVERY NOTE STAYS YOURS · EXPORT ANYTIME</p>
        </div>
      </div>
    </div>
  </section>;
}
