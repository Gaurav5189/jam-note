"use client";

import type { AutosaveStatus } from "@/lib/editor/use-autosave";

/**
 * Quiet autosave status chip — fixed bottom-right corner where it originally resided.
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
        className="save-chip error"
      >
        SYNC FAILED — RETRY?
      </button>
    );
  }

  if (status === "saving") {
    return <span className="save-chip saving">SAVING…</span>;
  }

  return <span className="save-chip saved">FILED</span>;
}
