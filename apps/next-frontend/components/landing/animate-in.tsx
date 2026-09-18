"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface AnimateInProps {
  children: ReactNode;
  /** Extra Tailwind / CSS classes forwarded to the wrapper div. */
  className?: string;
  /** Delay before the transition starts once in-view (ms). Default: 0 */
  delay?: number;
  /** Fire only on the first intersection (default true). */
  once?: boolean;
}

/**
 * Wraps children in a fade-up reveal driven by IntersectionObserver.
 * Respects `prefers-reduced-motion` — the global CSS reset in globals.css
 * collapses all animation/transition durations to 0.01ms, so motion-sensitive
 * users see an instant reveal instead of a jump. No extra dependency.
 */
export function AnimateIn({
  children,
  className = "",
  delay = 0,
  once = true,
}: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-700 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-5 opacity-0"
      }`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
