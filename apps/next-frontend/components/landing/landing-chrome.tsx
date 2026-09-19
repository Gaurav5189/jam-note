"use client";

import { useEffect } from "react";

export function LandingChrome() {
  useEffect(() => {
    document.documentElement.classList.add("landing-ready");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        reveal.unobserve(entry.target);
      }
    }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((node) => reveal.observe(node));

    const progress = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const bar = document.querySelector<HTMLElement>(".progress i");
      if (bar) bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    };
    addEventListener("scroll", progress, { passive: true });
    progress();

    const toast = document.querySelector<HTMLElement>(".toast");
    let toastTimer = 0;
    const onToast = (event: Event) => {
      if (!toast) return;
      const detail = (event as CustomEvent<string>).detail;
      const label = toast.querySelector("span:last-child");
      if (label) label.textContent = detail;
      clearTimeout(toastTimer);
      toast.classList.add("show");
      toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
    };
    addEventListener("jam:toast", onToast);

    const burstLayer = document.querySelector<HTMLElement>(".ink-bursts");
    const onInkBurst = (event: Event) => {
      if (!burstLayer) return;
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!Number.isFinite(detail?.x) || !Number.isFinite(detail?.y)) return;
      for (let index = 0; index < 30; index++) {
        const dot = document.createElement("i");
        const angle = Math.random() * Math.PI * 2;
        const distance = 18 + Math.random() * 62;
        dot.style.left = `${detail.x}px`;
        dot.style.top = `${detail.y}px`;
        dot.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
        dot.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
        dot.style.setProperty("--size", `${1.4 + Math.random() * 2.4}px`);
        burstLayer.append(dot);
        window.setTimeout(() => dot.remove(), 650);
      }
    };
    addEventListener("jam:ink-burst", onInkBurst);

    const hero = document.querySelector<HTMLElement>(".hero-title");
    const kineticLetters = hero
      ? [...hero.querySelectorAll<HTMLElement>(".k")]
          .filter((letter) => !letter.classList.contains("k-s") && !letter.classList.contains("sp"))
          .map((element) => ({ element, ci: 0, set: false }))
      : [];

    let introDone = false;
    let introTimer = 0;
    const startIntro = () => {
      document.body.classList.add("go");
      introTimer = window.setTimeout(() => {
        introDone = true;
        document.body.classList.add("intro-done");
      }, reducedMotion ? 50 : 2300);
    };

    if (document.fonts?.ready) {
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1600)),
      ]).then(() => {
        requestAnimationFrame(startIntro);
      });
    } else {
      startIntro();
    }

    const ptr = { x: -9999, y: -9999, in: false };
    let kineticFrame = 0;
    const trackHeroPointer = (event: PointerEvent) => {
      ptr.x = event.clientX;
      ptr.y = event.clientY;
    };
    const onHeroEnter = () => { ptr.in = true; };
    const onHeroLeave = () => { ptr.in = false; };

    addEventListener("pointermove", trackHeroPointer, { passive: true });
    hero?.addEventListener("pointerenter", onHeroEnter);
    hero?.addEventListener("pointerleave", onHeroLeave);

    const kineticLoop = () => {
      if (introDone && !reducedMotion && hero) {
        const hr = hero.getBoundingClientRect();
        const act = ptr.in && hr.bottom > 40 && hr.top < innerHeight;
        for (const L of kineticLetters) {
          let t = 0;
          if (act) {
            const r = L.element.getBoundingClientRect();
            const d = Math.hypot(r.left + r.width / 2 - ptr.x, r.top + r.height / 2 - ptr.y);
            t = Math.max(0, 1 - d / 175);
            t = t * t * (3 - 2 * t);
          }
          const p = L.ci + (t - L.ci) * 0.16;
          if (Math.abs(p) > 0.004 || Math.abs(L.ci) > 0.004) {
            L.ci = p;
            L.set = true;
            L.element.style.fontVariationSettings = `'wght' ${Math.round(830 + p * 70)}, 'wdth' ${(112 + p * 13).toFixed(1)}`;
          } else if (L.set) {
            L.set = false;
            L.ci = 0;
            L.element.style.fontVariationSettings = "";
          }
        }
      }
      kineticFrame = requestAnimationFrame(kineticLoop);
    };

    const drifts = [...document.querySelectorAll<HTMLElement>("[data-drift]")].map((node) => ({ node, x: 0 }));
    let driftFrame = 0;
    const driftLoop = () => {
      if (!reducedMotion) {
        for (const drift of drifts) {
          const rect = drift.node.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > innerHeight) continue;
          const normalized = Math.max(-1.25, Math.min(1.25, (rect.top + rect.height / 2 - innerHeight / 2) / (innerHeight / 2)));
          const targetX = normalized * innerWidth * 0.034;
          drift.x += (targetX - drift.x) * 0.13;
          drift.node.style.translate = `${drift.x}px 0`;
          drift.node.style.opacity = "";
        }
      }
      driftFrame = requestAnimationFrame(driftLoop);
    };

    kineticFrame = requestAnimationFrame(kineticLoop);
    driftFrame = requestAnimationFrame(driftLoop);

    return () => {
      reveal.disconnect();
      removeEventListener("scroll", progress);
      removeEventListener("jam:toast", onToast);
      removeEventListener("jam:ink-burst", onInkBurst);
      removeEventListener("pointermove", trackHeroPointer);
      hero?.removeEventListener("pointerenter", onHeroEnter);
      hero?.removeEventListener("pointerleave", onHeroLeave);
      document.body.classList.remove("go", "intro-done");
      clearTimeout(toastTimer);
      clearTimeout(introTimer);
      cancelAnimationFrame(kineticFrame);
      cancelAnimationFrame(driftFrame);
    };
  }, []);

  return <>
    <div className="cropmarks chrome" aria-hidden="true"><i className="cm-tl" /><i className="cm-tr" /><i className="cm-bl" /><i className="cm-br" /></div>
    <div className="grain chrome" aria-hidden="true" />
    <div className="progress chrome" aria-hidden="true"><i /></div>
    <div className="ink-bursts" aria-hidden="true" />
    <div className="toast" role="status"><i /><span>Ready.</span></div>
  </>;
}
