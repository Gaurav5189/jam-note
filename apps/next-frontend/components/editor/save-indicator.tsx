"use client";

import { useOnlineStatus } from "@/lib/use-online-status";
import type { AutosaveStatus } from "@/lib/editor/use-autosave";

/**
 * Quiet autosave status chip — fixed bottom-right corner where it
 * originally resided. When connectivity drops while edits are pending
 * (Phase 7), the chip reads "OFFLINE — CHANGES QUEUED" and supersedes
 * the status chips; it comes back the moment the connection returns
 * (the autosave hook flushes on the `online` event).
 */
export function SaveIndicator({
  status,
  onRetry,
}: {
  status: AutosaveStatus;
  onRetry: () => void;
}) {
  const online = useOnlineStatus();

  const pending =
    status === "dirty" || status === "saving" || status === "error";

  if (!online && pending) {
    return <span className="save-chip offline">OFFLINE — CHANGES QUEUED</span>;
  }

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
