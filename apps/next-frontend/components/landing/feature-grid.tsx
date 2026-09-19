"use client";

import { useEffect, useRef, useState } from "react";

type Module = {
  id: string;
  tag: string;
  category: string;
  icon: string;
  title: string;
  description: string;
  scale: 1 | 2 | 3;
  x: number;
  y: number;
  badge?: string;
};

const modules: Module[] = [
  { id: "M-01", tag: "/block-editor", category: "EDITOR", icon: "▤", title: "BLOCK EDITOR", description: "Type / for headings, todos, code, drawings.", scale: 1, x: 25, y: 30 },
  { id: "M-02", tag: "/jam-canvas", category: "CANVAS", icon: "✻", title: "JAM CANVAS", description: "Arrange every block in an infinite field.", scale: 1, x: 65, y: 40 },
  { id: "M-03", tag: "/autosave", category: "SYNC", icon: "↺", title: "AUTOSAVE", description: "Crash-safe saves with a local draft mirror.", scale: 2, x: 45, y: 70 },
  { id: "M-04", tag: "/palette", category: "PALETTE", icon: "⊕", title: "⌘K PALETTE", description: "Search the whole workspace instantly.", scale: 1, x: 75, y: 20 },
  { id: "M-05", tag: "/note-tree", category: "TREE", icon: "⎘", title: "NOTE TREE", description: "Nest notes to any depth; lose nothing.", scale: 2, x: 15, y: 65 },
  { id: "M-06", tag: "/publishing", category: "PUBLISH", icon: "✶", title: "PUBLISHING", description: "A public URL for the draft that is ready.", scale: 1, x: 35, y: 80, badge: "SOON" },
  { id: "M-07", tag: "/multiplayer", category: "SYNC", icon: "⧉", title: "MULTIPLAYER", description: "Real-time sync with your team.", scale: 3, x: 85, y: 55 },
  { id: "M-08", tag: "/export", category: "EXPORT", icon: "⎚", title: "PDF EXPORT", description: "Document rendering for JSON and Markdown.", scale: 3, x: 50, y: 15 },
  { id: "M-09", tag: "/api-access", category: "DEV", icon: "⏣", title: "REST API", description: "Headless access to all workspace nodes.", scale: 2, x: 80, y: 80 },
  { id: "M-10", tag: "/dark-mode", category: "THEME", icon: "◐", title: "DARK MODE", description: "Toggle the physical environment stock.", scale: 3, x: 10, y: 20 },
];

export function FeatureGrid() {
  const rackRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeTagRef = useRef<HTMLButtonElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const rack = rackRef.current;
    const popover = popoverRef.current;
    if (!rack || !popover) return;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tags = [...rack.querySelectorAll<HTMLButtonElement>(".spatial-tag")];
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const positionPopover = () => {
      const activeTag = activeTagRef.current;
      if (!activeTag) return;

      const rect = activeTag.getBoundingClientRect();
      const popoverWidth = 240;
      const popoverHeight = popover.offsetHeight || 180;
      let left = rect.left;
      let top = rect.bottom + 8;

      if (left + popoverWidth > innerWidth - 20) left = rect.right - popoverWidth;
      if (left < 20) left = 20;

      if (top + popoverHeight > innerHeight - 20) {
        top = rect.top - popoverHeight - 8;
        popover.style.transformOrigin = "bottom left";
      } else {
        popover.style.transformOrigin = "top left";
      }

      top = Math.max(20, Math.min(top, innerHeight - popoverHeight - 20));

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };

    const onPointerMove = (event: PointerEvent) => {
      targetX = (event.clientX / innerWidth - 0.5) * 2;
      targetY = (event.clientY / innerHeight - 0.5) * 2;
    };

    const animate = () => {
      if (!reducedMotion) {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        tags.forEach((tag) => {
          const scale = Number(tag.dataset.scale);
          const depth = (4 - scale) * 15;
          tag.style.transform = `translate(calc(-50% + ${currentX * depth}px), calc(-50% + ${currentY * depth}px))`;
        });
      }
      positionPopover();
      frame = requestAnimationFrame(animate);
    };

    addEventListener("pointermove", onPointerMove, { passive: true });
    animate();
    return () => {
      removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  const activate = (index: number, tag: HTMLButtonElement) => {
    activeTagRef.current = tag;
    setActiveIndex(index);
  };

  const dismiss = (index: number) => {
    if (activeIndex !== index) return;
    activeTagRef.current = null;
    setActiveIndex(null);
  };

  const activeModule = activeIndex === null ? null : modules[activeIndex];

  return <section ref={rackRef} className="modules module-rack-spread" id="modules" aria-label="Module rack">
    <div className="plate-intro" data-reveal data-drift>
      <p className="kicker">SPREAD 03 — PLATE 01 · THE RACK</p>
      <h2 className="plate-statement"><span>A RACK OF</span><span>MODULES,</span><span>NOT A TOOLBAR<i>.</i></span></h2>
      <p className="dek">A toolbar decides what you can do. A rack decides what you can mount. Snap in the modules a thought needs — outliner, canvas, sketch, timer — and pull them off when the work is done. Your rack, your business.</p>
    </div>
    <div className="spatial-rack">
      <header className="rack-running rack-running-head"><span className="rack-title"><b>03</b> / MODULE RACK</span><span className="rack-hint">HOVER OVER A MODULE FOR ITS SPECIMEN</span></header>
      <div className="spatial-canvas">
        {modules.map((module, index) => <button
          key={module.id}
          className={`spatial-tag ${activeIndex === index ? "active" : ""}`}
          data-scale={module.scale}
          style={{ left: `${module.x}%`, top: `${module.y}%` }}
          aria-describedby={activeIndex === index ? "module-specimen" : undefined}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") activate(index, event.currentTarget); }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") dismiss(index); }}
          onFocus={(event) => activate(index, event.currentTarget)}
          onBlur={() => dismiss(index)}
          onClick={(event) => activate(index, event.currentTarget)}
        >{module.tag}</button>)}
      </div>
      <div ref={popoverRef} id="module-specimen" className={`module-specimen ${activeModule ? "visible" : ""}`} aria-live="polite">
        {activeModule && <>
          <div className="specimen-top"><span>{activeModule.id} / {activeModule.category}</span><i aria-hidden="true" /></div>
          <div className="specimen-icon" aria-hidden="true">{activeModule.icon}</div>
          <h2>{activeModule.title}{activeModule.badge && <small>{activeModule.badge}</small>}</h2>
          <p>{activeModule.description}</p>
          <span className="specimen-corner" aria-hidden="true">⌟</span>
        </>}
      </div>
      <footer className="rack-running rack-running-foot" aria-hidden="true" />
    </div>
  </section>;
}
