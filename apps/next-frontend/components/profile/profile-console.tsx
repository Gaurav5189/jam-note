"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useWorkspace } from "@/context/workspace-context";
import { fetchApi } from "@/lib/api";
import { flattenNotes } from "@/lib/workspace-tree";
import { useOnlineStatus } from "@/lib/use-online-status";
import type { ImportCommit, ImportPreview, TrashItem, User, WorkspaceTree } from "@/lib/types";
import { ExportModal } from "./export-modal";

/**
 * The Profile page — the operator's index card
 * (make/dashboard_profile/design.md).
 *
 * Sections: Account (identity card, inline display-name edit),
 * Security (password form with live validation), Workspace data
 * (Import row with the .json-only help, Export row opening the index
 * modal), Trash (inline expansion panel with restore + purge), plus
 * the page-local toast stack (bottom-left paper cards — design §6;
 * NOT the desk chrome's toast line).
 */

type Toast = { id: number; message: string; err: boolean; out: boolean };

const TOAST_LIFETIME_MS = 3200;
const TOAST_EXIT_MS = 300;
const PURGE_CONFIRM_RESET_MS = 2500;
const TRASH_RETENTION_DAYS = 30;

function countFolders(folders: WorkspaceTree["folders"]): number {
  let total = 0;
  for (const folder of folders) {
    total += 1 + countFolders(folder.folders);
  }
  return total;
}

function daysLeft(deletedAt: string, now: number): number {
  const elapsedDays = Math.floor(
    (now - new Date(deletedAt).getTime()) / 86_400_000
  );
  return Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
}

// ─── Display name (inline edit) ────────────────────────────────────────

function DisplayNameRow({
  user,
  notify,
}: {
  user: User;
  notify: (message: string, err?: boolean) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = user.profile.display_name || user.username;

  const startEdit = () => {
    setDraft(displayName);
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    const value = draft.trim();
    if (!value) {
      notify("NAME CAN'T BE EMPTY.", true);
      return;
    }
    if (value === displayName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await fetchApi("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ display_name: value }),
      });
      setEditing(false);
      // The runhead reads the user from the server layout — a refresh
      // re-renders it with the new name (and this row's prop).
      router.refresh();
      notify("DISPLAY NAME SAVED.");
    } catch (err) {
      notify(err instanceof Error ? err.message.toUpperCase() : "SAVE FAILED — TRY AGAIN.", true);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="p-field-row">
        <span className="p-field-label">Display name</span>
        <div className="p-field-edit">
          <input
            className="p-name-input"
            value={draft}
            maxLength={60}
            autoFocus
            aria-label="Display name"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
          <button type="button" className="p-btn-text" onClick={() => void save()} disabled={saving}>
            Save
          </button>
          <button type="button" className="p-btn-text" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-field-row">
      <span className="p-field-label">Display name</span>
      <div className="p-field-edit">
        <span className="p-field-value">{displayName}</span>
        <button type="button" className="p-btn-text" onClick={startEdit}>
          Edit
        </button>
      </div>
    </div>
  );
}

// ─── Password form ─────────────────────────────────────────────────────

function PasswordForm({
  notify,
}: {
  notify: (message: string, err?: boolean) => void;
}) {
  const [pw0, setPw0] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show0, setShow0] = useState(false);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const lengthHint =
    pw1.length === 0
      ? { cls: "", text: "At least 8 characters" }
      : pw1.length < 8
        ? { cls: "bad", text: "Too short — 8 characters minimum" }
        : { cls: "ok", text: "Looks good" };

  const matchHint =
    pw2.length === 0
      ? { cls: "", text: "" }
      : pw1 === pw2
        ? { cls: "ok", text: "Matches" }
        : { cls: "bad", text: "Doesn't match" };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (pw0.length === 0) {
      setStatus({ ok: false, text: "Enter your current password first" });
      return;
    }
    if (pw1.length < 8) {
      setStatus({ ok: false, text: "Password must be at least 8 characters" });
      return;
    }
    if (pw1 !== pw2) {
      setStatus({ ok: false, text: "Passwords don't match" });
      return;
    }
    setBusy(true);
    try {
      await fetchApi("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: pw0,
          new_password: pw1,
          confirm_password: pw2,
        }),
      });
      setStatus({ ok: true, text: "Password updated" });
      notify("PASSWORD UPDATED.");
      setPw0("");
      setPw1("");
      setPw2("");
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof Error ? err.message : "Update failed — try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="p-pw-field">
        <label htmlFor="ppw0">Current password</label>
        <div className="p-pw-wrap">
          <input
            className={`p-pw-input${status && !status.ok && pw0.length === 0 ? " err" : ""}`}
            type={show0 ? "text" : "password"}
            id="ppw0"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={pw0}
            onChange={(event) => setPw0(event.target.value)}
          />
          <button
            type="button"
            className="p-pw-toggle"
            onClick={() => setShow0((s) => !s)}
            aria-label={show0 ? "Hide current password" : "Show current password"}
          >
            {show0 ? "HIDE" : "SHOW"}
          </button>
        </div>
        <div className="p-pw-hint">
          {status && !status.ok && pw0.length === 0
            ? "Required to rotate your password"
            : ""}
        </div>
      </div>
      <div className="p-pw-grid">
        <div className="p-pw-field">
          <label htmlFor="ppw1">New password</label>
          <div className="p-pw-wrap">
            <input
              className="p-pw-input"
              type={show1 ? "text" : "password"}
              id="ppw1"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={pw1}
              onChange={(event) => setPw1(event.target.value)}
            />
            <button
              type="button"
              className="p-pw-toggle"
              onClick={() => setShow1((s) => !s)}
              aria-label={show1 ? "Hide new password" : "Show new password"}
            >
              {show1 ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div className={`p-pw-hint ${lengthHint.cls}`}>{lengthHint.text}</div>
        </div>
        <div className="p-pw-field">
          <label htmlFor="ppw2">Confirm password</label>
          <div className="p-pw-wrap">
            <input
              className={`p-pw-input${matchHint.cls === "bad" ? " err" : ""}`}
              type={show2 ? "text" : "password"}
              id="ppw2"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={pw2}
              onChange={(event) => setPw2(event.target.value)}
            />
            <button
              type="button"
              className="p-pw-toggle"
              onClick={() => setShow2((s) => !s)}
              aria-label={show2 ? "Hide confirm password" : "Show confirm password"}
            >
              {show2 ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div className={`p-pw-hint ${matchHint.cls}`}>{matchHint.text}</div>
        </div>
      </div>
      <div className="p-pw-actions">
        <button type="submit" className="p-btn-gold" disabled={busy}>
          Update password
        </button>
        {status && (
          <span
            className={`p-pw-status ${status.ok ? "ok" : "bad"}`}
            role="status"
          >
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

// ─── Trash expansion panel ─────────────────────────────────────────────

function TrashPanel({
  trash,
  onRestore,
  onPurge,
}: {
  trash: TrashItem[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Mount-gated clock — SSR renders the deterministic date slice
    // (scheduled callback; never synchronous setState in the effect body).
    const first = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(first);
  }, []);

  return (
    <div className="p-trash-panel">
      {trash.length === 0 ? (
        <p className="p-trash-empty">Empty — nothing shredded yet.</p>
      ) : (
        trash.map((item) => (
          <div key={item.id} className="p-trash-row">
            <span className="p-pick-icon p-trash-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" width="100%" height="100%">
                <path
                  d="M4 1.8h5L12.2 5v8.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="p-trash-title">{item.title}</span>
            <span className="p-trash-meta" title="Deleted at (UTC)">
              {item.deleted_at.slice(0, 16).replace("T", " ")} UTC
              {now !== null && ` · PURGES IN ${daysLeft(item.deleted_at, now)}D`}
            </span>
            <button
              type="button"
              className="p-btn-ghost"
              onClick={() => onRestore(item.id)}
            >
              Restore
            </button>
            <PurgeButton noteId={item.id} onPurge={onPurge} />
          </div>
        ))
      )}
    </div>
  );
}

function PurgeButton({
  noteId,
  onPurge,
}: {
  noteId: string;
  onPurge: (id: string) => void;
}) {
  // Two-step confirm, auto-resets — the same pattern as the sidebar's
  // two-step delete (no native confirm dialogs).
  const [confirming, setConfirming] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const start = () => {
    setConfirming(true);
    resetTimer.current = setTimeout(() => setConfirming(false), PURGE_CONFIRM_RESET_MS);
  };

  const purge = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setConfirming(false);
    onPurge(noteId);
  };

  if (confirming) {
    return (
      <button type="button" className="p-btn-ghost p-purge-chip" onClick={purge}>
        PURGE NOW?
      </button>
    );
  }

  return (
    <button type="button" className="p-btn-ghost p-purge-btn" onClick={start}>
      Purge
    </button>
  );
}

// ─── The console ───────────────────────────────────────────────────────

export function ProfileConsole({
  user,
  initialTrash,
}: {
  user: User;
  initialTrash: TrashItem[];
}) {
  const { tree, refreshWorkspace } = useWorkspace();
  const online = useOnlineStatus();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Import row state — pending = validated preview awaiting the confirm.
  // The token makes commit IDEMPOTENT: a retry after a lost response
  // (slow networks) replays the same import instead of duplicating it.
  // It is minted per FILE and kept until the import succeeds.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{
    body: string;
    token: string;
    preview: ImportPreview;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importHelpOpen, setImportHelpOpen] = useState(false);

  // Trash section state.
  const [trash, setTrash] = useState<TrashItem[]>(initialTrash);
  const [trashOpen, setTrashOpen] = useState(false);

  const notify = useCallback((message: string, err = false) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current, { id, message, err, out: false }]);
    window.setTimeout(() => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, out: true } : toast))
      );
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_EXIT_MS);
    }, TOAST_LIFETIME_MS);
  }, []);

  const closeExport = useCallback(() => {
    setExportOpen(false);
    // Focus returns to the Export row button on close (design §7).
    exportBtnRef.current?.focus();
  }, []);

  const noteCount = flattenNotes(tree).length;
  const folderCount = useMemo(() => countFolders(tree.folders), [tree.folders]);
  const displayName = user.profile.display_name || user.username;
  const memberSince = user.created_at.slice(0, 10);

  const pickFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".json")) {
      notify("ONLY .JSON — MARKDOWN PASTES DIRECTLY INTO ANY NOTE.", true);
      return;
    }
    try {
      const body = await file.text();
      // Client-side pre-parse surfaces a broken file fast; the server
      // re-validates everything (the real defense).
      JSON.parse(body);
      const preview = await fetchApi<ImportPreview>("/api/import/preview", {
        method: "POST",
        body,
      });
      setPendingImport({ body, token: crypto.randomUUID(), preview });
      notify(`${preview.message.toUpperCase()} — READY TO IMPORT.`);
    } catch (err) {
      notify(
        err instanceof Error && err.message
          ? err.message.toUpperCase()
          : "IMPORT FAILED — INVALID FILE.",
        true
      );
    }
  };

  const commitImport = async () => {
    if (!pendingImport || importing) return;
    setImporting(true);
    try {
      const result = await fetchApi<ImportCommit>(
        `/api/import/commit?import_token=${encodeURIComponent(pendingImport.token)}`,
        {
          method: "POST",
          body: pendingImport.body,
        }
      );
      notify(`${result.message.toUpperCase()}.`);
      setPendingImport(null);
      void refreshWorkspace();
    } catch (err) {
      notify(
        err instanceof Error && err.message
          ? err.message.toUpperCase()
          : "IMPORT FAILED.",
        true
      );
    } finally {
      setImporting(false);
    }
  };

  const toggleTrash = async () => {
    const next = !trashOpen;
    setTrashOpen(next);
    if (!next) return;
    // Deletions that happened elsewhere in the session (sidebar) may
    // have landed while the panel was closed — refetch on open.
    try {
      setTrash(await fetchApi<TrashItem[]>("/api/notes/trash"));
    } catch {
      notify("TRASH UNREACHABLE — TRY AGAIN.", true);
    }
  };

  const restoreNote = async (id: string) => {
    try {
      await fetchApi(`/api/notes/${id}/restore`, { method: "POST" });
      setTrash((current) => current.filter((item) => item.id !== id));
      notify("NOTE RESTORED — BACK ON THE DESK.");
      void refreshWorkspace();
    } catch (err) {
      notify(err instanceof Error ? err.message.toUpperCase() : "RESTORE FAILED.", true);
    }
  };

  const purgeNote = async (id: string) => {
    try {
      await fetchApi(`/api/notes/${id}/purge`, { method: "POST" });
      setTrash((current) => current.filter((item) => item.id !== id));
      notify("NOTE PURGED — GONE FOR GOOD.", true);
    } catch (err) {
      notify(err instanceof Error ? err.message.toUpperCase() : "PURGE FAILED.", true);
    }
  };

  return (
    <>
      <main className="p-stage">
        <p className="p-kicker"><i aria-hidden="true" />Profile</p>
        <h1 className="p-title">Your account</h1>
        <p className="p-dek">
          Identity, security, and the notes you keep filed on this desk.
        </p>
        <p className="p-colophon">
          <span>
            Member since <em>{memberSince}</em>
          </span>
          <span>
            <em>{String(noteCount).padStart(2, "0")}</em> notes filed
          </span>
          <span>
            <em>{String(folderCount).padStart(2, "0")}</em> folders
          </span>
        </p>

        {/* ── Account ── */}
        <section className="p-section">
          <p className="p-sec-label"><i aria-hidden="true" />Account</p>
          <div className="p-panel p-pad">
            <div className="p-id-row">
              <div className="p-avatar" aria-hidden="true">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="p-id-fields">
                <div className="p-field-row">
                  <span className="p-field-label">Username</span>
                  {/* Printed on the card — dimmed, no edit affordance. */}
                  <span className="p-field-value dim">@{user.username}</span>
                </div>
                <div className="p-field-row">
                  <span className="p-field-label">Email</span>
                  <span className="p-field-value dim">{user.email}</span>
                </div>
                <DisplayNameRow user={user} notify={notify} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Security ── */}
        <section className="p-section">
          <p className="p-sec-label"><i aria-hidden="true" />Security</p>
          <div className="p-panel p-pad">
            <PasswordForm notify={notify} />
          </div>
        </section>

        {/* ── Workspace data ── */}
        <section className="p-section">
          <p className="p-sec-label"><i aria-hidden="true" />Workspace data</p>
          <div className="p-panel">
            <div className="p-data-row">
              <span className="p-row-idx">A</span>
              <div className="p-row-body">
                <div className="p-row-title">Import</div>
                <div className="p-row-desc">
                  Restore a backup export. Markdown content can be pasted
                  directly into any note.
                </div>
                {pendingImport && (
                  <div className="p-row-preview" role="status">
                    {pendingImport.preview.message.toUpperCase()} ·{" "}
                    {Math.max(1, Math.round(pendingImport.preview.size_bytes / 1024))} KB —
                    READY TO IMPORT
                  </div>
                )}
                {importHelpOpen && (
                  <div className="p-row-help">
                    ONLY JAM-NOTE .JSON BACKUPS RESTORE — .MD AND .ZIP ARE NOT
                    IMPORT FORMATS. MARKDOWN CONTENT PASTES DIRECTLY INTO ANY
                    NOTE.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="p-row-help-toggle"
                onClick={() => setImportHelpOpen((open) => !open)}
                aria-expanded={importHelpOpen}
                aria-label="What can be imported?"
                title="What can be imported?"
              >
                ?
              </button>
              <span className="p-row-tag">.JSON ONLY</span>
              <div className="p-row-actions">
                <button
                  type="button"
                  className="p-btn-ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload
                </button>
                <button
                  type="button"
                  className="p-btn-ghost"
                  onClick={() => void commitImport()}
                  disabled={!pendingImport || importing}
                  title={
                    pendingImport
                      ? "Import the validated backup"
                      : "Upload a .json backup first"
                  }
                >
                  {pendingImport ? "Import now" : "Import"}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="p-file-input"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void pickFile(file);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="p-data-row">
              <span className="p-row-idx">B</span>
              <div className="p-row-body">
                <div className="p-row-title">Export</div>
                <div className="p-row-desc">
                  Search the workspace and pick a note or a folder to download.
                </div>
              </div>
              <span className="p-row-tag">PICKER</span>
              <div className="p-row-actions">
                <button
                  type="button"
                  className="p-btn-ghost"
                  ref={exportBtnRef}
                  onClick={() => setExportOpen(true)}
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trash ── */}
        <section className="p-section">
          <p className="p-sec-label"><i aria-hidden="true" />Trash</p>
          <div className="p-panel">
            <div className="p-data-row">
              <span className="p-row-idx">&gt;</span>
              <div className="p-row-body">
                <div className="p-row-title">Recently deleted</div>
                <div className="p-row-desc">
                  Deleted notes stay here for 30 days before they&apos;re purged
                  for good.
                </div>
              </div>
              <span className="p-row-tag">
                {String(trash.length).padStart(2, "0")} ITEMS
              </span>
              <div className="p-row-actions">
                <button
                  type="button"
                  className="p-btn-ghost"
                  onClick={() => void toggleTrash()}
                  aria-expanded={trashOpen}
                >
                  {trashOpen ? "Close trash" : "Open trash"}
                </button>
              </div>
            </div>
            {trashOpen && (
              <TrashPanel
                trash={trash}
                onRestore={(id) => void restoreNote(id)}
                onPurge={(id) => void purgeNote(id)}
              />
            )}
          </div>
        </section>
      </main>

      {/* Toast stack — bottom-left paper cards (design §6), page-local.
          The desk chrome's toast line stays for chrome events only. */}
      <div className="p-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-toast${toast.err ? " err" : ""}${toast.out ? " out" : ""}`}
            role="status"
          >
            <i aria-hidden="true" />
            {toast.message}
          </div>
        ))}
      </div>

      <ExportModal
        key={exportOpen ? "export-open" : "export-closed"}
        open={exportOpen}
        onClose={closeExport}
        notify={notify}
      />

      {!online && (
        <div className="p-offline" role="status">
          OFFLINE — CHANGES QUEUE LOCALLY AND FLUSH ON RECONNECT.
        </div>
      )}
    </>
  );
}
