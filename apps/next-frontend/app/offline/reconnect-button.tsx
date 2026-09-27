"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for the offline fallback page: reload the moment
 * the browser reports the connection is back, plus a manual retry control.
 */
export function ReconnectButton() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="border border-border-thin bg-background-steel px-5 py-2.5 font-mono text-xs tracking-[0.2em] text-text-primary transition-colors hover:border-accent-neon hover:text-accent-neon"
    >
      RETRY CONNECTION
    </button>
  );
}
