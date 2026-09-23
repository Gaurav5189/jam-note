"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { downloadFile } from "@/lib/api";
import {
  buildPickerList,
  filterPickerList,
  folderNotes,
  pickerNotePath,
  type PickerEntry,
} from "@/lib/export-picker";
import { useWorkspace } from "@/context/workspace-context";

/**
 * The export modal — a paper index card laid on the dark desk
 * (make/dashboard_profile design.md §5). Browse → confirm → download;
 * the download control collapses and fills gold (minimum 1.5s so the
 * animation always reads), then auto-closes.
 */

type Mode = "browse" | "confirm";
type DownloadState = "rest" | "downloading" | "done";

const DOWNLOAD_MIN_MS = 1500;
const DONE_CLOSE_MS = 1000;

const ICON_FOLDER =
  "M1.5 4a1 1 0 0 1 1-1h3.4l1.3 1.4h6.3a1 1 0 0 1 1 1v7.1a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4Z";
const ICON_NOTE =
  "M4 1.8h5L12.2 5v8.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z";

interface Selection {
  kind: "folder" | "note";
  id: string;
  name: string;
  path: string[];
}

interface FormatChoice {
  id: string;
  label: string;
  desc: string;
}

function formatChoices(kind: Selection["kind"]): FormatChoice[] {
  if (kind === "note") {
    return [
      { id: "md", label: ".MD", desc: "Human-readable markdown — for sharing" },
      { id: "json", label: ".JSON", desc: "Lossless backup — restorable via import" },
    ];
  }
  return [
    { id: "zip", label: ".ZIP", desc: "Flat bundle of markdown files — for sharing" },
    { id: "json", label: ".JSON", desc: "Single backup manifest — restorable via import" },
  ];
}

export function ExportModal({
  open,
  onClose,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string, err?: boolean) => void;
}) {
  const { tree } = useWorkspace();
  const [mode, setMode] = useState<Mode>("browse");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [format, setFormat] = useState<string>("md");
  const [downloadState, setDownloadState] = useState<DownloadState>("rest");

  const searchRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mountedRef MUST re-arm true in the effect body (StrictMode dev
  // double-invoke) — a cleanup-only guard swallows post-await logic.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  // The parent remounts this modal via `key` on every open toggle, so
  // state starts fresh each time — no setState-in-effect reset needed.
  // Autofocus lands on the search input (design §7).
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  const entries = useMemo(() => buildPickerList(tree), [tree]);
  const visible = useMemo(
    () => filterPickerList(entries, query),
    [entries, query]
  );

  // Esc steps back before closing; click-outside always closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (mode === "confirm") setMode("browse");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose, open]);

  const select = useCallback(
    (entry: PickerEntry) => {
      setSelection({ kind: entry.kind, id: entry.id, name: entry.name, path: entry.path });
      setFormat(entry.kind === "folder" ? "zip" : "md");
      setMode("confirm");
    },
    []
  );

  const containedNotes = useMemo(
    () => (selection?.kind === "folder" ? folderNotes(tree, selection.id) : []),
    [selection, tree]
  );

  const noteMeta = useMemo(
    () => (selection?.kind === "note" ? pickerNotePath(tree, selection.id) : null),
    [selection, tree]
  );

  const runDownload = useCallback(async () => {
    if (!selection || downloadState !== "rest") return;
    setDownloadState("downloading");

    const endpoint =
      selection.kind === "note"
        ? `/api/notes/${selection.id}/export?format=${format}`
        : `/api/folders/${selection.id}/export?format=${format}`;
    const fallback =
      selection.kind === "folder"
        ? `${selection.name || "folder"}.zip`
        : `${selection.name || "untitled"}.${format}`;

    try {
      const [filename] = await Promise.all([
        downloadFile(endpoint, fallback),
        // Minimum display duration — the animation always reads even
        // when the network resolves faster. Reduced motion: instant.
        new Promise((resolve) =>
          setTimeout(resolve, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DOWNLOAD_MIN_MS)
        ),
      ]);
      if (!mountedRef.current) return;
      setDownloadState("done");
      notify(`EXPORTED ${filename.toUpperCase()}`);
      doneTimer.current = setTimeout(() => {
        if (mountedRef.current) onClose();
      }, DONE_CLOSE_MS);
    } catch (err) {
      if (!mountedRef.current) return;
      setDownloadState("rest");
      notify(
        err instanceof Error && err.message
          ? err.message.toUpperCase()
          : "EXPORT FAILED — TRY AGAIN.",
        true
      );
    }
  }, [downloadState, format, notify, onClose, selection]);

  if (!open) return null;

  return (
    <div
      className="p-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="p-modal" role="dialog" aria-modal="true" aria-label="Export">
        <div className="p-modal-head">
          <div className="p-modal-title">Index — Export</div>
          <button
            type="button"
            className="p-modal-esc"
            onClick={() => (mode === "confirm" ? setMode("browse") : onClose())}
          >
            ESC TO CLOSE
          </button>
        </div>

        {mode === "browse" ? (
          <div>
            <div className="p-modal-search">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search notes & folders…"
                autoComplete="off"
                aria-label="Search the workspace"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const entry = visible[activeIndex];
                    if (entry) select(entry);
                  }
                }}
              />
            </div>
            <div className="p-modal-list">
              {visible.length === 0 ? (
                <div className="p-modal-empty">No match in workspace</div>
              ) : (
                visible.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`p-pick-row${index === activeIndex ? " is-active" : ""}`}
                    onClick={() => select(entry)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span
                      className={`p-pick-icon ${entry.kind === "folder" ? "folder" : "note"}`}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 16 16" fill="none" width="100%" height="100%">
                        <path
                          d={entry.kind === "folder" ? ICON_FOLDER : ICON_NOTE}
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                        {entry.kind === "note" && (
                          <path d="M9 1.8V5h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        )}
                      </svg>
                    </span>
                    <div className="p-pick-main">
                      <div className="p-pick-name">{entry.name}</div>
                      <div className="p-pick-path">
                        {entry.path.length > 0
                          ? ["WORKSPACE", ...entry.path].join(" / ")
                          : "WORKSPACE"}
                      </div>
                    </div>
                    <span className="p-pick-fmt">
                      {entry.kind === "folder" ? ".ZIP" : ".MD"}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="p-modal-foot">
              <span>&uarr;&darr; Navigate</span>
              <span>&crarr; Select</span>
              <span>Esc Close</span>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="p-confirm-back"
              onClick={() => setMode("browse")}
            >
              &larr; Back to search
            </button>
            <div className="p-confirm-head">
              <span
                className={`p-pick-icon ${selection?.kind === "folder" ? "folder" : "note"}`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 16 16" fill="none" width="100%" height="100%">
                  <path
                    d={selection?.kind === "folder" ? ICON_FOLDER : ICON_NOTE}
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <div className="p-confirm-name">{selection?.name}</div>
                <div className="p-confirm-meta">
                  {selection?.kind === "folder"
                    ? `${containedNotes.length} file${containedNotes.length === 1 ? "" : "s"} inside`
                    : (noteMeta && noteMeta.length > 0
                        ? ["WORKSPACE", ...noteMeta].join(" / ")
                        : "WORKSPACE")}
                  {" · "}
                  {format.toUpperCase()}
                </div>
              </div>
            </div>

            {selection?.kind === "folder" && (
              <div className="p-confirm-list">
                {containedNotes.length === 0 ? (
                  <div className="p-modal-empty">Nothing filed in here yet</div>
                ) : (
                  containedNotes.map((note) => (
                    <div key={note.id} className="p-confirm-file">
                      <span className="p-pick-icon note" aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none" width="100%" height="100%">
                          <path
                            d={ICON_NOTE}
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <div>
                        <div className="p-confirm-file-name">{note.name}</div>
                        <div className="p-confirm-file-path">
                          {note.relPath.length > 0
                            ? note.relPath.join(" / ")
                            : selection.name}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Format choice — md/zip for sharing, json for backup. */}
            <div className="p-format-choices" role="radiogroup" aria-label="Export format">
              {selection &&
                formatChoices(selection.kind).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={format === choice.id}
                    className={`p-format${format === choice.id ? " is-active" : ""}`}
                    onClick={() => setFormat(choice.id)}
                  >
                    <span className="p-format-label">{choice.label}</span>
                    <span className="p-format-desc">{choice.desc}</span>
                  </button>
                ))}
            </div>

            <div className="p-dlbtn-wrap">
              <button
                type="button"
                className={`p-dlbtn${downloadState === "downloading" ? " is-downloading" : ""}${
                  downloadState === "done" ? " is-done" : ""
                }`}
                onClick={() => void runDownload()}
                disabled={downloadState !== "rest"}
              >
                <span className="p-dlbtn-box">
                  <svg className="p-dlbtn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                      d="M12 19V5m0 14-4-4m4 4 4-4"
                    />
                  </svg>
                  <span className="p-dlbtn-fill" />
                </span>
                <span className="p-dlbtn-label">
                  {downloadState === "done" ? "Downloaded" : "Download"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
