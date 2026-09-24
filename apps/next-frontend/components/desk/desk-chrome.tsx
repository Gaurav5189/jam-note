"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";

export const DESK_TOAST_EVENT = "jam:desk-toast";
export const DESK_BURST_EVENT = "jam:desk-burst";
export const DESK_FLY_EVENT = "jam:desk-fly";
export const DESK_SIGNOUT_EVENT = "jam:desk-signout";

/** Fire a mono toast line (bottom-left paper chip). */
export function deskToast(message: string) {
  window.dispatchEvent(new CustomEvent(DESK_TOAST_EVENT, { detail: message }));
}

/** One-shot confirmation ink burst at viewport coordinates. Never a trail. */
export function deskBurst(x: number, y: number, color: string) {
  window.dispatchEvent(new CustomEvent(DESK_BURST_EVENT, { detail: { x, y, color } }));
}

/** Fly a small paper chip from (x, y) to the runhead's profile chip —
 *  the "trashed note goes to Profile" arc. Label rides the chip. */
export function deskFly(x: number, y: number, label: string) {
  window.dispatchEvent(
    new CustomEvent(DESK_FLY_EVENT, { detail: { x, y, label } })
  );
}

const REGMARK =
  "M10 1.5v5M10 14v5M1.5 10h5M14 10h5";

/**
 * The desk's shared chrome: boot choreography, crop marks, toast,
 * confirmation ink bursts, and the session-end sign-out overlay.
 *
 * Intentionally NOT ported from the concept: the grain texture, the
 * pointer-following dot trail, and the registration-mark cursor
 * (user decisions — see app/(app)/desk.css).
 */
export function DeskChrome() {
  const router = useRouter();
  const [signoutOpen, setSignoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const mountedRef = useRef(false);

  // mountedRef MUST re-arm true in the effect body — a cleanup-only
  // effect leaves it permanently false after StrictMode's dev
  // double-invoke and silently swallows post-await logic.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Boot gate — same choreography as the landing + auth plates: wait
  // for the exact font strings (raced against a 1600ms cap), double-
  // rAF, then set body.go. intro-done cancels the intro transitions
  // at ~1900ms so the kinetic field may take over.
  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let introTimer = 0;

    const ensureFonts = () => {
      if (!document.fonts?.ready) return Promise.resolve();
      const samples = ["900 72px Archivo", "400 72px Newsreader", "400 72px 'Space Mono'"];
      return Promise.all(samples.map((s) => document.fonts.load(s))).then(() => document.fonts.ready);
    };

    Promise.race([ensureFonts(), new Promise((resolve) => setTimeout(resolve, 1600))]).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!mountedRef.current) return;
          document.body.classList.add("go");
          introTimer = window.setTimeout(() => {
            if (!mountedRef.current) return;
            document.body.classList.add("intro-done");
          }, reducedMotion ? 50 : 1900);
        });
      });
    });

    return () => {
      document.body.classList.remove("go", "intro-done");
      clearTimeout(introTimer);
    };
  }, []);

  // Toast lines.
  useEffect(() => {
    const toast = (event: Event) => {
      const line = document.querySelector<HTMLElement>(".desk .toast");
      const label = line?.querySelector("span:last-child");
      if (!line || !label) return;
      label.textContent = (event as CustomEvent<string>).detail;
      line.classList.add("show");
      window.setTimeout(() => line.classList.remove("show"), 3200);
    };
    addEventListener(DESK_TOAST_EVENT, toast);
    return () => removeEventListener(DESK_TOAST_EVENT, toast);
  }, []);

  // Confirmation ink bursts — skipped for reduced-motion users.
  useEffect(() => {
    const onBurst = (event: Event) => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const { x, y, color } = (event as CustomEvent<{ x: number; y: number; color: string }>).detail;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const layer = document.querySelector<HTMLElement>(".desk .ink-bursts");
      if (!layer) return;
      for (let index = 0; index < 30; index++) {
        const dot = document.createElement("i");
        const angle = Math.random() * Math.PI * 2;
        const distance = 18 + Math.random() * 62;
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
        dot.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
        dot.style.setProperty("--size", `${1.4 + Math.random() * 2.4}px`);
        dot.style.setProperty("--burst", color);
        layer.append(dot);
        window.setTimeout(() => dot.remove(), 650);
      }
    };
    addEventListener(DESK_BURST_EVENT, onBurst);
    return () => removeEventListener(DESK_BURST_EVENT, onBurst);
  }, []);

  // Fly-to-profile chips — a trashed note's little paper card arcs to
  // the runhead avatar (the Profile door). Skipped for reduced-motion.
  useEffect(() => {
    const onFly = (event: Event) => {
      const { x, y, label } = (
        event as CustomEvent<{ x: number; y: number; label: string }>
      ).detail;
      const layer = document.querySelector<HTMLElement>(".desk .ink-bursts");
      const target = document.querySelector<HTMLElement>("[data-desk-avatar]");
      if (!layer || !target) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const rect = target.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - x;
      const dy = rect.top + rect.height / 2 - y;

      const chip = document.createElement("i");
      chip.className = "fly-chip";
      chip.textContent = label;
      chip.style.left = `${x}px`;
      chip.style.top = `${y}px`;
      layer.append(chip);

      // Arc: pop in, rise, then shrink into the profile chip and fade.
      const settle = chip.animate(
        [
          {
            transform: "translate(-50%,-50%) scale(.6) rotate(0deg)",
            opacity: 0,
          },
          {
            transform: "translate(-50%,-50%) scale(1) rotate(-3deg)",
            opacity: 1,
            offset: 0.15,
          },
          {
            transform: `translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${
              Math.min(dy * 0.3, -30) - 52
            }px)) scale(.92) rotate(-6deg)`,
            opacity: 1,
            offset: 0.55,
          },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.1) rotate(9deg)`,
            opacity: 0,
          },
        ],
        { duration: 720, easing: "cubic-bezier(.45,0,.55,1)" }
      );
      settle.onfinish = () => chip.remove();
      window.setTimeout(() => chip.remove(), 1000);
    };
    addEventListener(DESK_FLY_EVENT, onFly);
    return () => removeEventListener(DESK_FLY_EVENT, onFly);
  }, []);

  // Sign-out overlay — the concept's session-end plate, repurposed as
  // a confirmation step: RESUME SESSION cancels, SIGN OUT logs out.
  useEffect(() => {
    const open = () => setSignoutOpen(true);
    addEventListener(DESK_SIGNOUT_EVENT, open);
    return () => removeEventListener(DESK_SIGNOUT_EVENT, open);
  }, []);

  useEffect(() => {
    if (!signoutOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSignoutOpen(false);
        deskToast("SESSION RESUMED — WELCOME BACK.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signoutOpen]);

  const resume = () => {
    setSignoutOpen(false);
    deskToast("SESSION RESUMED — WELCOME BACK.");
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetchApi("/api/auth/logout", { method: "POST" });
      if (!mountedRef.current) return;
      router.push("/login");
    } catch (err) {
      if (!mountedRef.current) return;
      setSigningOut(false);
      console.error("Failed to logout:", err);
      deskToast("THE PLATE IS UNREACHABLE — TRY AGAIN.");
    }
  };

  return (
    <>
      <div className="cropmarks chrome" aria-hidden="true">
        <i className="cm-tl" /><i className="cm-tr" /><i className="cm-bl" /><i className="cm-br" />
      </div>
      <div className="ink-bursts" aria-hidden="true" />
      <div className="toast" role="status"><i /><span>Ready.</span></div>

      <div
        className={`endov${signoutOpen ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Sign out"
      >
        <svg className="regmark" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d={REGMARK} stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <p className="end-word">SESSION CLOSED</p>
        <p className="end-line">THE DESK IS FILED — COME BACK SOON.</p>
        <div className="end-actions">
          <button type="button" className="end-btn end-btn-primary" onClick={resume}>
            RESUME SESSION
          </button>
          <button type="button" className="end-btn end-btn-ghost" onClick={signOut} disabled={signingOut}>
            SIGN OUT
          </button>
        </div>
      </div>
    </>
  );
}
