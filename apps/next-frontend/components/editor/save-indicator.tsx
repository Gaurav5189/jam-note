"use client";

import type { AutosaveStatus } from "@/lib/editor/use-autosave";

/**
 * Quiet autosave status chip — fixed bottom-right of the viewport.
 * Silence during typing is deliberate: an indicator that flickers per
 * keystroke is noise, not status.
 */
export function SaveIndicator({
  status,
  onRetry,
}: {
  status: AutosaveStatus;
  onRetry: () => void;
}) {
  if (status === "idle" || status === "dirty") return null;

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="fixed bottom-4 right-4 z-40 text-[10px] font-mono uppercase tracking-widest text-accent-amber bg-background-panel border border-accent-amber/50 rounded-sm px-3 py-2 hover:border-accent-amber transition-colors"
      >
        Sync failed — retry?
      </button>
    );
  }

  const label = status === "saving" ? "Saving…" : "Saved";
  const className =
    status === "saving"
      ? "fixed bottom-4 right-4 z-40 text-[10px] font-mono uppercase tracking-widest text-text-muted bg-background-panel border border-border-thin rounded-sm px-3 py-2"
      : "fixed bottom-4 right-4 z-40 text-[10px] font-mono uppercase tracking-widest text-accent-neon bg-background-panel border border-accent-neon/40 rounded-sm px-3 py-2";

  return <span className={className}>{label}</span>;
}
