"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
import { useWorkspace } from "@/context/workspace-context";
import { downloadFile } from "@/lib/api";
import type { NoteListItem } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { beginNavPending } from "@/lib/pending-bar";
import { deskFly, deskToast } from "@/components/desk/desk-chrome";

/* The reference design's filled bin — a static mark on the trash row
 * (no motion; the drop/spin animation was removed on request). */
const TRASH_CAN_PATH =
  "M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z";

/**
 * The note action menu — one paper index card for both homes: the note
 * bar (document mode) and every row of the dashboard's recent list.
 *
 * Rows: last-edited stamp (info), EXPORT (.md), PIN/UNPIN,
 * READ-ONLY/EDITABLE lock, and the two-step TRASH (arms to CONFIRM
 * TRASH?, auto-resets after 2.5s; on confirm the note flies to the
 * runhead profile chip). All actions hit the live workspace tree, so
 * both views re-render optimistically.
 */
export function NoteMenu({
  anchorRef,
  note,
  onClose,
  onDeleted,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  note: NoteListItem;
  onClose: () => void;
  /** Called after a confirmed delete — the note view navigates home. */
  onDeleted?: () => void;
}) {
  const { setNotePinned, setNoteReadOnly, deleteNote } = useWorkspace();
  const [arming, setArming] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refs: popRefs, floatingStyles } = useFloating({
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const floatingElRef = useRef<HTMLDivElement | null>(null);

  // Wire the anchor elements in effects, never during render (the
  // linter forbids render-phase reads of hook-returned ref objects).
  useEffect(() => {
    popRefs.setReference(anchorRef.current);
    popRefs.setFloating(floatingElRef.current);
    return () => {
      popRefs.setReference(null);
      popRefs.setFloating(null);
    };
  }, [popRefs, anchorRef]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (
        popRefs.floating.current &&
        !popRefs.floating.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, popRefs]);

  const origin = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    return {
      x: rect ? rect.left + rect.width / 2 : innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : innerHeight / 2,
    };
  };

  const handleExport = () => {
    onClose();
    downloadFile(
      `/api/notes/${note.id}/export?format=md`,
      `${note.title || "untitled"}.md`
    )
      .then((filename) => deskToast(`EXPORTED — ${filename.toUpperCase()}`))
      .catch(() => deskToast("EXPORT FAILED — THE PLATE IS UNREACHABLE."));
  };

  const handlePin = (pinned: boolean) => {
    onClose();
    setNotePinned(note.id, pinned).catch(() => {});
    deskToast(pinned ? "NOTE PINNED." : "NOTE UNPINNED.");
  };

  const handleLock = (readOnly: boolean) => {
    onClose();
    setNoteReadOnly(note.id, readOnly).catch(() => {});
    deskToast(readOnly ? "NOTE LOCKED — READ-ONLY." : "NOTE UNLOCKED — EDITABLE.");
  };

  const arm = () => {
    setArming(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setArming(false), 2500);
  };

  const confirmTrash = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    onClose();
    try {
      const { purged } = await deleteNote(note.id);
      const { x, y } = origin();
      deskFly(x, y, purged ? "SHREDDED" : "TO TRASH");
      deskToast(
        purged
          ? "EMPTY NOTE SHREDDED — NOTHING TO RESTORE."
          : "NOTE FILED TO TRASH — 30 DAYS."
      );
    } catch {
      deskToast("DELETE FAILED — NOTE STILL FILED.");
      return;
    }
    if (onDeleted) {
      beginNavPending();
      onDeleted();
    }
  };

  return createPortal(
    <div
      ref={floatingElRef}
      style={floatingStyles}
      className="nm-pop"
      role="menu"
      aria-label={`Actions for ${note.title}`}
    >
      <div className="nm-info">
        LAST EDITED — {formatLocalDateTime(note.updated_at)}
      </div>
      <button type="button" role="menuitem" className="nm-row" onClick={handleExport}>
        EXPORT — .MD
      </button>
      <button
        type="button"
        role="menuitem"
        className="nm-row"
        onClick={() => handlePin(!note.is_pinned)}
      >
        {note.is_pinned ? "UNPIN FROM DASHBOARD" : "PIN TO DASHBOARD"}
      </button>
      <button
        type="button"
        role="menuitem"
        className="nm-row"
        onClick={() => handleLock(!note.read_only)}
      >
        {note.read_only ? "MAKE EDITABLE" : "MAKE READ-ONLY"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={`nm-row nm-danger${arming ? " is-armed" : ""}`}
        onClick={() => (arming ? void confirmTrash() : arm())}
        aria-label={arming ? "Confirm — file to trash" : "File to trash (30 days)"}
      >
        <svg className="nm-bin" viewBox="0 0 448 512" aria-hidden="true">
          <path d={TRASH_CAN_PATH} />
        </svg>
        <span>{arming ? "CONFIRM TRASH?" : "TRASH — 30 DAYS"}</span>
      </button>
    </div>,
    document.body
  );
}
