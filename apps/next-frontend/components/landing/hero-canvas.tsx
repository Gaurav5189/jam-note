"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";

// three.js lives in its own client-only chunk (~900 KB), streamed in AFTER
// first paint (PHASES.md Phase 5: the text-first hero must not wait on WebGL)
// — and, since the HeroMountGate below, only once the browser reports spare
// main-thread capacity. Compiling the 3D chunk during the hydration window
// would contend with exactly the moment the user starts reading the hero.
const HeroCanvas3D = dynamic(() => import("./hero-canvas-3d"), { ssr: false });

const noopSubscribe = () => () => {};

let webglCache: boolean | null = null;

function supportsWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

function getWebglSnapshot(): boolean {
  if (webglCache === null) webglCache = supportsWebgl();
  return webglCache;
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

// Decorative background behind the landing hero. A static dot-grid always
// paints first (and stays permanently for reduced-motion / no-WebGL
// clients); the 3D lattice fades in on top only when it is safe to show.
export function HeroCanvas() {
  const webgl = useSyncExternalStore(
    noopSubscribe,
    getWebglSnapshot,
    () => false,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );

  // Idle gate: requestIdleCallback fires once the main thread has spare
  // capacity, so the three.js chunk is fetched/compiled AFTER the critical
  // startup window instead of contending with it. The 1200 ms timeout keeps
  // the hero from waiting indefinitely on a busy page; browsers without rIC
  // (Safari) fall back to a short timeout. Async setState in an effect
  // callback — never synchronous — so the React Compiler lint rules hold.
  const [idle, setIdle] = useState(false);
  const enable3D = webgl && !reducedMotion;

  useEffect(() => {
    if (!enable3D || idle) return;
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(() => setIdle(true), { timeout: 1200 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(() => setIdle(true), 150);
    return () => clearTimeout(timer);
  }, [enable3D, idle]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Static fallback: zero-JS dot lattice, masked so it dissolves
          towards the edges of the hero. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,#393E46_1px,transparent_1.5px)] bg-[size:34px_34px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_45%,black_35%,transparent_100%)]" />

      {enable3D && idle && (
        <div className="landing-canvas landing-canvas-in absolute inset-0">
          <HeroCanvas3D />
        </div>
      )}
    </div>
  );
}
