"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { fetchApi } from "@/lib/api";

type FormKey = "login" | "signup";

const ORDER: Record<FormKey, number> = { login: 0, signup: 1 };

// Chrome follows the active slip: runhead center label, ghost plate word,
// and the document title (also mirrored into per-route metadata exports).
const FORM_DEFS: Record<FormKey, { label: string; ghost: string; title: string }> = {
  login: { label: "FORM A1 — SYSTEM ACCESS", ghost: "ACCESS", title: "Jam Notes — System Access" },
  signup: { label: "FORM B1 — WORKSPACE CREATION", ghost: "CREATE", title: "Jam Notes — Create Workspace" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NETWORK_HINTS = ["failed to fetch", "networkerror", "load failed", "fetch failed"];
const BASE_ROTATION = -0.4;

// Split display glyphs with the per-letter kinetic delay — the same timing
// ramp the concept builds at runtime (.32s base + .035s per letter). Spaces
// stay calm and never join the hover field.
const letters = (text: string, prefix: string, delay: number) =>
  [...text].map((char, index) => (
    <span
      key={`${prefix}-${index}`}
      className={`k ${char === " " ? "sp" : ""}`}
      style={{ "--d": `${delay + index * 0.035}s` } as React.CSSProperties}
    >
      {char === " " ? "\u00A0" : char}
    </span>
  ));

// 16 punched perforation dots, staggered like film-strip sprockets.
const PERFORATION_STAGGER = Array.from({ length: 16 }, (_, index) => index * 0.03);

function Perforation() {
  return (
    <div className="slip-perf" aria-hidden="true">
      {PERFORATION_STAGGER.map((delay, index) => (
        <i key={index} style={{ "--pd": `${delay}s` } as React.CSSProperties} />
      ))}
    </div>
  );
}

// Proofreader's squiggle — red stroke that draws itself under invalid entries.
function Squiggle() {
  return (
    <svg className="squig" viewBox="0 0 120 5" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M0 3.5 Q3 .5 6 3.5 T12 3.5 T18 3.5 T24 3.5 T30 3.5 T36 3.5 T42 3.5 T48 3.5 T54 3.5 T60 3.5 T66 3.5 T72 3.5 T78 3.5 T84 3.5 T90 3.5 T96 3.5 T102 3.5 T108 3.5 T114 3.5 T120 3.5" />
    </svg>
  );
}

// Barcode — the coupon serial carried on the landing, reprinted here.
const BARCODE_PATH = "M0 0h2.6v26H0zM5 0h1.4v26H5zM9.4 0h3.2v26H9.4zM15 0h1.4v26H15zM18.6 0h2.2v26h-2.2zM23.4 0h1.4v26h-1.4zM26.8 0h3.4v26h-3.4zM32.4 0h1.4v26h-1.4zM35.8 0h2.2v26h-2.2zM40.4 0h1.4v26h-1.4zM44 0h3.2v26H44zM49.6 0h1.4v26h-1.4zM53 0h2.2v26H53zM57.6 0h1.4v26h-1.4zM61 0h3.4v26H61zM67 0h1.4v26h-1.4zM70.4 0h2.2v26h-2.2zM75 0h1.4v26h-1.4zM78.6 0h3.2v26h-3.2zM84.2 0h1.4v26h-1.4zM87.6 0h2.2v26h-2.2zM92.2 0h1.4v26h-1.4zM95.8 0h3.4v26h-3.4zM101.6 0h1.4v26h-1.4zM105 0h2.2v26h-2.2zM109.6 0h1.4v26h-1.4zM113 0h3.2v26h-3.2zM118.4 0h1.6v26h-1.6z";

function FootCode() {
  return (
    <span className="foot-code">
      <svg viewBox="0 0 120 26" aria-hidden="true" fill="currentColor"><path d={BARCODE_PATH} /></svg>
      <span>8 4JAM2 βETA9</span>
    </span>
  );
}

// One printed field sheet row. An error replaces the field number in red.
function Field({
  id,
  name,
  label,
  number,
  delay,
  type,
  autoComplete,
  value,
  onChange,
  error,
}: {
  id: string;
  name: string;
  label: string;
  number: string;
  delay: number;
  type: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  return (
    <div className={`field${error ? " err" : ""}`} style={{ "--rd": `${delay}s` } as React.CSSProperties}>
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        <span className="fno" data-n={number}>{error ?? number}</span>
      </div>
      <div className="field-in">
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <Squiggle />
      </div>
    </div>
  );
}

export function AuthSlips({ initialForm }: { initialForm: "login" | "signup" }) {
  const [active, setActive] = useState<FormKey>(initialForm);
  // Transient cross-fade state: the outgoing slip keeps out-l/out-r for the
  // 500ms slide, then returns to the hidden base (visibility flips after
  // the fade via the delayed CSS transition).
  const [out, setOut] = useState<{ key: FormKey; dir: 1 | -1 } | null>(null);
  const [tick, setTick] = useState(0);
  const [busyFor, setBusyFor] = useState<FormKey | null>(null);
  const [stampedFor, setStampedFor] = useState<FormKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);

  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suUser, setSuUser] = useState("");
  const [suName, setSuName] = useState("");
  const [suPw, setSuPw] = useState("");

  const router = useRouter();
  const { refreshUser } = useAuth();

  const activeRef = useRef<FormKey>(initialForm);
  const reducedRef = useRef(false);
  const mountedRef = useRef(true);

  const showToast = useCallback((msg: string) => {
    setToast((prev) => ({ msg, id: (prev?.id ?? 0) + 1 }));
  }, []);

  const shake = useCallback(() => {
    const slip = document.getElementById(`slip-${activeRef.current}`);
    if (!slip) return;
    slip.classList.remove("shake");
    slip.getBoundingClientRect(); // force reflow so the shake restarts cleanly
    slip.classList.add("shake");
  }, []);

  // Success confirmation — a single gold ink burst at the CTA (never a
  // trail). Reduced motion gets the stamp + toast only.
  const burstAtCta = useCallback((key: FormKey) => {
    if (reducedRef.current) return;
    const layer = document.querySelector<HTMLElement>(".auth .ink-bursts");
    const cta = document.querySelector<HTMLElement>(`#slip-${key} .slip-cta`);
    if (!layer || !cta) return;
    const rect = cta.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (let index = 0; index < 30; index++) {
      const dot = document.createElement("i");
      const angle = Math.random() * Math.PI * 2;
      const distance = 18 + Math.random() * 62;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      dot.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
      dot.style.setProperty("--size", `${1.4 + Math.random() * 2.4}px`);
      layer.append(dot);
      window.setTimeout(() => dot.remove(), 650);
    }
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // Combined input handler: keep the controlled value in sync AND clear
  // that field's red mark on input (the concept's clearErr-on-input).
  const inputFor = useCallback((field: string, set: (value: string) => void) => {
    return (value: string) => {
      set(value);
      clearError(field);
    };
  }, [clearError]);

  // Server errors map into the proofreading system: known 400/401 details
  // become red field marks + shake, everything else (422, network, 503)
  // toasts only.
  const applyServerError = useCallback((form: FormKey, err: unknown) => {
    const message = err instanceof Error ? err.message : "";
    const network = NETWORK_HINTS.some((hint) => message.toLowerCase().includes(hint));
    if (form === "login" && message.includes("Incorrect username or password")) {
      setErrors({ loginPw: "INCORRECT" });
      shake();
      showToast("PROOFREAD — CREDENTIALS REJECTED IN RED.");
      return;
    }
    if (form === "signup" && message.includes("already registered")) {
      setErrors({ suEmail: "ALREADY REGISTERED" });
      shake();
      showToast("PROOFREAD — THIS EMAIL IS ALREADY FILED.");
      return;
    }
    // Every server error shakes the slip — the proofreader rejects the
    // whole form, not just the fields it can mark.
    shake();
    showToast(network || !message ? "THE PLATE IS UNREACHABLE — TRY AGAIN." : message.toUpperCase());
  }, [shake, showToast]);

  const measureStage = useCallback(() => {
    const stage = document.getElementById("slip-stage");
    const slip = document.getElementById(`slip-${activeRef.current}`);
    if (stage && slip) stage.style.height = `${slip.offsetHeight}px`;
  }, []);

  // Slip ↔ slip cross-fade. The incoming slip enters from its resting
  // transform (matching the concept's effective entry in both directions);
  // chrome follows via the active state and the key-based tick replay.
  const showForm = useCallback((key: FormKey) => {
    const prev = activeRef.current;
    if (key === prev) return;
    activeRef.current = key;
    const dir = ORDER[key] > ORDER[prev] ? 1 : -1;
    setOut({ key: prev, dir });
    setActive(key);
    setTick((value) => value + 1);
    history.replaceState(null, "", `#${key}`);
    // Clear kinetic inline settings on both slips so a re-entering slip
    // starts from the CSS rest recipe (the concept's clearKin).
    (["login", "signup"] as FormKey[]).forEach((k) => {
      document.getElementById(`slip-${k}`)?.querySelectorAll<HTMLElement>(".k").forEach((el) => {
        el.style.fontVariationSettings = "";
      });
    });
  }, []);

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyFor || stampedFor) return;
    const marks: Array<[string, string]> = [];
    if (!loginId.trim()) marks.push(["loginId", "REQUIRED"]);
    if (!loginPw) marks.push(["loginPw", "REQUIRED"]);
    if (marks.length) {
      setErrors(Object.fromEntries(marks));
      shake();
      showToast(`PROOFREAD — ${marks.length} MARK${marks.length > 1 ? "S" : ""} IN RED.`);
      document.getElementById(marks[0][0])?.focus();
      return;
    }
    setBusyFor("login");
    const startedAt = Date.now();
    try {
      await fetchApi("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email_or_username: loginId, password: loginPw }),
      });
      await refreshUser();
      if (!mountedRef.current) return;
      // Minimum busy window so fast responses don't flicker the button.
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setBusyFor(null);
        setStampedFor("login");
        burstAtCta("login");
        showToast("CREDENTIALS ACCEPTED — WELCOME BACK.");
        window.setTimeout(() => {
          if (mountedRef.current) router.push("/dashboard");
        }, 1400);
      }, Math.max(0, 420 - (Date.now() - startedAt)));
    } catch (err) {
      if (!mountedRef.current) return;
      setBusyFor(null);
      applyServerError("login", err);
    }
  };

  const submitSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyFor || stampedFor) return;
    const email = suEmail.trim();
    const username = suUser.trim();
    const marks: Array<[string, string]> = [];
    if (!email) marks.push(["suEmail", "REQUIRED"]);
    else if (!EMAIL_RE.test(email)) marks.push(["suEmail", "NOT AN EMAIL"]);
    if (!username) marks.push(["suUser", "REQUIRED"]);
    else if (username.length < 3) marks.push(["suUser", "TOO SHORT"]);
    if (!suPw) marks.push(["suPw", "REQUIRED"]);
    else if (suPw.length < 8) marks.push(["suPw", "MIN 8 CHARACTERS"]);
    if (marks.length) {
      setErrors(Object.fromEntries(marks));
      shake();
      showToast(`PROOFREAD — ${marks.length} MARK${marks.length > 1 ? "S" : ""} IN RED.`);
      document.getElementById(marks[0][0])?.focus();
      return;
    }
    setBusyFor("signup");
    const startedAt = Date.now();
    try {
      await fetchApi("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          username,
          password: suPw,
          display_name: suName.trim() || undefined,
        }),
      });
      await refreshUser();
      if (!mountedRef.current) return;
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setBusyFor(null);
        setStampedFor("signup");
        burstAtCta("signup");
        showToast("WORKSPACE CREATED — YOUR SLIP IS FILED.");
        window.setTimeout(() => {
          if (mountedRef.current) router.push("/dashboard");
        }, 1400);
      }, Math.max(0, 420 - (Date.now() - startedAt)));
    } catch (err) {
      if (!mountedRef.current) return;
      setBusyFor(null);
      applyServerError("signup", err);
    }
  };

  // Transient cross-fade classes clear after the slide finishes.
  useEffect(() => {
    if (!out) return;
    const timer = window.setTimeout(() => setOut(null), 500);
    return () => window.clearTimeout(timer);
  }, [out]);

  // The toast stays visible across consecutive messages; the timer re-arms.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // The document title follows the active slip (corrects the layout title
  // for hash deep links like /login#signup).
  useEffect(() => {
    document.title = FORM_DEFS[active].title;
  }, [active]);

  useLayoutEffect(() => {
    measureStage();
  }, [active, measureStage]);

  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reducedMotion;

    // Per-slip kinetic glyph state (letters only — spaces stay calm).
    const kin: Partial<Record<FormKey, Array<{ el: HTMLElement; ci: number; set: boolean }>>> = {};
    (["login", "signup"] as FormKey[]).forEach((key) => {
      const slip = document.getElementById(`slip-${key}`);
      kin[key] = slip
        ? [...slip.querySelectorAll<HTMLElement>(".k")]
            .filter((el) => !el.classList.contains("sp"))
            .map((el) => ({ el, ci: 0, set: false }))
        : [];
    });

    // The slip is loose — nudge it by its header (springs back). Direct
    // manipulation, so it stays available under reduced motion; the
    // spring-back transition is zeroed by the CSS kill-switch.
    const nudgeCleanups: Array<() => void> = [];
    document.querySelectorAll<HTMLElement>(".slip-head").forEach((head) => {
      const card = head.closest<HTMLElement>(".slip-card");
      if (!card) return;
      let px: number | null = null;
      let py: number | null = null;
      let timer = 0;
      const down = (e: PointerEvent) => {
        head.setPointerCapture(e.pointerId);
        px = e.clientX;
        py = e.clientY;
        card.style.transition = "none";
      };
      const move = (e: PointerEvent) => {
        if (px === null || py === null) return;
        const dx = Math.min(26, Math.max(-26, e.clientX - px));
        const dy = Math.min(20, Math.max(-20, e.clientY - py));
        card.style.transform = `translate(${dx}px,${dy}px) rotate(${(BASE_ROTATION + dx * 0.06).toFixed(2)}deg)`;
      };
      const end = () => {
        if (px === null) return;
        px = null;
        card.style.transition = "transform .5s cubic-bezier(.2,1.5,.3,1)";
        card.style.transform = "";
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          card.style.transition = "";
        }, 540);
      };
      head.addEventListener("pointerdown", down);
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", end);
      head.addEventListener("pointercancel", end);
      nudgeCleanups.push(() => {
        head.removeEventListener("pointerdown", down);
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", end);
        head.removeEventListener("pointercancel", end);
        window.clearTimeout(timer);
      });
    });

    // Pointer trackers for the kinetic field and the ghost parallax.
    const ptr = { x: -9999, y: -9999 };
    const onPointer = (e: PointerEvent) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
    };
    addEventListener("pointermove", onPointer, { passive: true });
    const ghostIn = document.querySelector<HTMLElement>(".auth .g-in");
    let gx = 0;
    let gy = 0;
    let gtx = 0;
    let gty = 0;
    const onGhostPointer = (e: PointerEvent) => {
      gtx = (e.clientX / innerWidth - 0.5) * -18;
      gty = (e.clientY / innerHeight - 0.5) * -12;
    };
    addEventListener("pointermove", onGhostPointer, { passive: true });

    // Cursor-proximity Archivo weight/width field on the active slip's
    // title — same contract as the landing hero: 170px smoothstep field,
    // .16 influence lerp, wght 830→900 / wdth 112→125, self-clearing below
    // .004. Gated on the intro handoff; reduced motion never joins.
    let kineticFrame = 0;
    const kineticLoop = () => {
      if (document.body.classList.contains("intro-done") && !reducedMotion) {
        const stage = document.getElementById("slip-stage");
        if (stage) {
          const r = stage.getBoundingClientRect();
          const inStage = ptr.x > r.left - 60 && ptr.x < r.right + 60 && ptr.y > r.top - 60 && ptr.y < r.bottom + 60;
          for (const letter of kin[activeRef.current] ?? []) {
            let target = 0;
            if (inStage) {
              const lr = letter.el.getBoundingClientRect();
              const d = Math.hypot(lr.left + lr.width / 2 - ptr.x, lr.top + lr.height / 2 - ptr.y);
              target = Math.max(0, 1 - d / 170);
              target = target * target * (3 - 2 * target);
            }
            const p = letter.ci + (target - letter.ci) * 0.16;
            if (Math.abs(p) > 0.004 || Math.abs(letter.ci) > 0.004) {
              letter.ci = p;
              letter.set = true;
              letter.el.style.fontVariationSettings = `'wght' ${Math.round(830 + p * 70)}, 'wdth' ${(112 + p * 13).toFixed(1)}`;
            } else if (letter.set) {
              letter.set = false;
              letter.ci = 0;
              letter.el.style.fontVariationSettings = "";
            }
          }
        }
      }
      kineticFrame = requestAnimationFrame(kineticLoop);
    };

    // Ghost word parallax (very slight).
    let parallaxFrame = 0;
    const parallaxLoop = () => {
      if (!reducedMotion && ghostIn) {
        gx += (gtx - gx) * 0.06;
        gy += (gty - gy) * 0.06;
        ghostIn.style.transform = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px)`;
      }
      parallaxFrame = requestAnimationFrame(parallaxLoop);
    };
    kineticFrame = requestAnimationFrame(kineticLoop);
    parallaxFrame = requestAnimationFrame(parallaxLoop);

    // Boot — wait for the exact fonts we rely on, then print the slip.
    const ensureFonts = () => {
      if (!document.fonts?.ready) return Promise.resolve();
      const samples = ["900 72px Archivo", "400 72px Newsreader", "400 72px 'Space Mono'"];
      return Promise.all(samples.map((sample) => document.fonts.load(sample))).then(() => document.fonts.ready);
    };
    let introTimer = 0;
    let cancelled = false;
    Promise.race([ensureFonts(), new Promise((resolve) => setTimeout(resolve, 1600))]).then(() => {
      if (cancelled) return;
      // Hash-aware initial form: /login#signup opens on the signup slip
      // (the concept's instant path — no directional pre-position).
      const hashForm = location.hash === "#signup" ? "signup" : null;
      if (hashForm && hashForm !== activeRef.current) {
        activeRef.current = hashForm;
        setActive(hashForm);
        setTick((value) => value + 1);
      }
      // Double-rAF: first frame commits the initial transform state,
      // second frame starts the CSS transition so the slip prints smoothly.
      requestAnimationFrame(() => {
        if (cancelled) return;
        measureStage();
        document.body.classList.add("go");
        introTimer = window.setTimeout(() => {
          document.body.classList.add("intro-done");
        }, reducedMotion ? 50 : 1900);
      });
    });

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measureStage, 160);
    };
    addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(kineticFrame);
      cancelAnimationFrame(parallaxFrame);
      removeEventListener("pointermove", onPointer);
      removeEventListener("pointermove", onGhostPointer);
      removeEventListener("resize", onResize);
      nudgeCleanups.forEach((cleanup) => cleanup());
      window.clearTimeout(introTimer);
      window.clearTimeout(resizeTimer);
      document.body.classList.remove("go", "intro-done");
    };
  }, [measureStage]);

  // StrictMode runs effect cleanups once after mount before re-running the
  // effect, so the flag must be re-armed in the effect body — otherwise it
  // stays false and every mounted-check silently swallows the auth result.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const slipClass = (key: FormKey) =>
    `slip${active === key ? " on" : ""}${out?.key === key ? (out.dir > 0 ? " out-l" : " out-r") : ""}`;

  return (
    <>
      <div className="cropmarks chrome" aria-hidden="true"><i className="cm-tl" /><i className="cm-tr" /><i className="cm-bl" /><i className="cm-br" /></div>
      <header className="runhead chrome">
        <Link href="/" className="rh-l" aria-label="Jam Notes home">
          <span className="rh-full">JAM NOTES — SYSTEM ACCESS</span>
          <span className="rh-min">JAM NOTES</span>
        </Link>
        <span className={`rh-c${tick > 0 ? " tick" : ""}`} key={tick}>{FORM_DEFS[active].label}</span>
        <span className="rh-r">β — FREE</span>
      </header>
      <footer className="footbar chrome" aria-hidden="true">
        <span className="fb-side">SET IN ARCHIVO, NEWSREADER & SPACE MONO</span>
        <span>PRINTED IN FLAT GOLD & PROCESS BLACK · PLATE 02</span>
        <span className="fb-side">© 2026 JAM NOTES</span>
      </footer>
      <div className="grain chrome" aria-hidden="true" />
      <div className="ink-bursts" aria-hidden="true" />
      <div className={`toast${toast ? " show" : ""}`} role="status"><i /><span>{toast?.msg ?? ""}</span></div>

      <main className="plate">
        {/* Ghost plate word: ACCESS / CREATE */}
        <div className="ghost" aria-hidden="true">
          <span className="g-in">
            <span className={`ghost-word${tick > 0 ? " gtick" : ""}`} key={tick}>{FORM_DEFS[active].ghost}</span>
          </span>
        </div>
        <div className="rail rail-l io chrome" style={{ "--d": "1.2s" } as React.CSSProperties} aria-hidden="true">JAM NOTES — SYSTEM ACCESS · PLATE 02</div>
        <div className="rail rail-r io chrome" style={{ "--d": "1.3s" } as React.CSSProperties} aria-hidden="true">WRITE FAST · THINK IN SPACE · ED. β</div>

        <div className="slip-stage" id="slip-stage">
          {/* ============ FORM A1 — LOGIN ============ */}
          <article id="slip-login" className={slipClass("login")} inert={active !== "login"}>
            <div className={`slip-card${stampedFor === "login" ? " stamped" : ""}`}>
              <Perforation />
              <div className="slip-inner">
                <header className="slip-head" title="The slip is loose — nudge it by its header">
                  <span>FORM A1 — SYSTEM ACCESS</span>
                  <span>NO. 000041</span>
                </header>
                <div className="slip-title">
                  <h1 className="kinetic" aria-label="Jam Notes">
                    <span className="ht" aria-hidden="true">{letters("Jam Notes", "l", 0.32)}</span>
                  </h1>
                  <p className="slip-sub">SYSTEM ACCESS</p>
                </div>
                <form className="slip-form" noValidate onSubmit={submitLogin}>
                  <Field
                    id="loginId" name="login" label="EMAIL OR USERNAME" number="01" delay={0.5}
                    type="text" autoComplete="username"
                    value={loginId} onChange={inputFor("loginId", setLoginId)} error={errors.loginId ?? null}
                  />
                  <Field
                    id="loginPw" name="password" label="PASSWORD" number="02" delay={0.6}
                    type="password" autoComplete="current-password"
                    value={loginPw} onChange={inputFor("loginPw", setLoginPw)} error={errors.loginPw ?? null}
                  />
                  <button
                    className={`slip-cta${busyFor === "login" ? " busy" : ""}`}
                    type="submit"
                    style={{ "--rd": "0.72s" } as React.CSSProperties}
                  >
                    INITIALIZE
                  </button>
                </form>
                <footer className="slip-foot">
                  <span>JAM NOTES · ACCESS SLIP A1 — LOOSE ON THE PLATE</span>
                  <FootCode />
                </footer>
              </div>
              <div className="stamp" aria-hidden="true">ACCESS GRANTED</div>
            </div>
            <p className="crosslink">
              {"Don’t have an account? "}
              <a href="#signup" onClick={(event) => { event.preventDefault(); showForm("signup"); }}>Create workspace</a>
            </p>
          </article>

          {/* ============ FORM B1 — SIGNUP / WORKSPACE CREATION ============ */}
          <article id="slip-signup" className={slipClass("signup")} inert={active !== "signup"}>
            <div className={`slip-card${stampedFor === "signup" ? " stamped" : ""}`}>
              <Perforation />
              <div className="slip-inner">
                <header className="slip-head" title="The slip is loose — nudge it by its header">
                  <span>FORM B1 — WORKSPACE CREATION</span>
                  {/* serial 000042: the coupon clipped on the landing page */}
                  <span>NO. 000042</span>
                </header>
                <div className="slip-title">
                  <h2 className="kinetic" aria-label="Jam Notes">
                    <span className="ht" aria-hidden="true">{letters("Jam Notes", "s", 0.32)}</span>
                  </h2>
                  <p className="slip-sub">WORKSPACE CREATION</p>
                </div>
                <form className="slip-form" noValidate onSubmit={submitSignup}>
                  <Field
                    id="suEmail" name="email" label="EMAIL" number="01" delay={0.5}
                    type="email" autoComplete="email"
                    value={suEmail} onChange={inputFor("suEmail", setSuEmail)} error={errors.suEmail ?? null}
                  />
                  <Field
                    id="suUser" name="username" label="USERNAME" number="02" delay={0.58}
                    type="text" autoComplete="username"
                    value={suUser} onChange={(value) => { setSuUser(value.toLowerCase()); clearError("suUser"); }} error={errors.suUser ?? null}
                  />
                  <Field
                    id="suName" name="display" label="DISPLAY NAME (OPTIONAL)" number="03" delay={0.66}
                    type="text" autoComplete="nickname"
                    value={suName} onChange={setSuName} error={null}
                  />
                  <Field
                    id="suPw" name="new-password" label="PASSWORD" number="04" delay={0.74}
                    type="password" autoComplete="new-password"
                    value={suPw} onChange={setSuPw} error={errors.suPw ?? null}
                  />
                  <button
                    className={`slip-cta${busyFor === "signup" ? " busy" : ""}`}
                    type="submit"
                    style={{ "--rd": "0.86s" } as React.CSSProperties}
                  >
                    CREATE WORKSPACE
                  </button>
                </form>
                <footer className="slip-foot">
                  <span>JAM NOTES · SLIP B1 — THE CLIPPED COUPON</span>
                  <FootCode />
                </footer>
              </div>
              <div className="stamp" aria-hidden="true">WORKSPACE CREATED</div>
            </div>
            <p className="crosslink">
              Already have an account?{" "}
              <a href="#login" onClick={(event) => { event.preventDefault(); showForm("login"); }}>Access system</a>
            </p>
          </article>
        </div>
      </main>
    </>
  );
}
