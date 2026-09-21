"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface UseAutosaveOptions<T> {
  /** Inactivity window before a flush (ms). */
  delay?: number;
  /**
   * Hard cap on how long the document may stay dirty while the user
   * keeps typing (ms). The idle debounce resets on every keystroke, so
   * without this cap a crash during continuous typing could lose
   * everything since the last save.
   */
  maxWaitMs?: number;
  /** How long "saved" stays visible before returning to idle (ms). */
  savedHoldMs?: number;
  /** Reads the current payload at flush time — must not close over stale state. */
  getPayload: () => T;
  /** Persists the payload. `keepalive` lets page-unload flushes survive navigation. */
  save: (payload: T, options?: { keepalive?: boolean }) => Promise<void>;
}

const DEFAULT_DELAY_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 30_000;
const DEFAULT_SAVED_HOLD_MS = 1500;
/** Re-flush delay when changes landed while a save was already in flight. */
const REFLUSH_MS = 100;

interface FlushOptions {
  keepalive?: boolean;
}

/**
 * Debounced autosave state machine: idle → dirty → saving → saved → idle.
 *
 * Two timers bound data loss. The idle debounce (5s — reduced from the
 * original 10s, user decision September 2026) resets on every
 * keystroke and flushes once the user pauses. The
 * max-wait cap (30s) does NOT reset while typing: it fires once per dirty
 * period, so a browser crash mid-writing costs at most the cap, never
 * everything since the last save. Safety flushes still fire on tab hide,
 * `pagehide` (fires on both reload and close — more reliable than
 * beforeunload), `beforeunload` (keepalive) and editor unmount.
 * Errors keep the payload dirty (nothing is ever silently lost) and the
 * status stays "error" until a retry or the next edit re-arms the flush.
 */
export function useAutosave<T>(options: UseAutosaveOptions<T>) {
  const {
    delay = DEFAULT_DELAY_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    savedHoldMs = DEFAULT_SAVED_HOLD_MS,
    getPayload,
    save,
  } = options;

  const [status, setStatus] = useState<AutosaveStatus>("idle");

  // The hook is mounted in the editor component, so every piece of logic
  // runs through refs — status transitions are the only re-render trigger,
  // and identical setState values make React bail out mid-typing.
  const statusRef = useRef<AutosaveStatus>("idle");
  const getPayloadRef = useRef(getPayload);
  const saveRef = useRef(save);

  const dirty = useRef(false);
  const inFlight = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Self-referencing flush — resolved through a ref so the in-flight
  // finally-block can schedule the next run.
  const flushRef = useRef<(options?: FlushOptions) => Promise<void>>(
    async () => {}
  );

  const cancelDebounce = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  const cancelMaxWait = useCallback(() => {
    if (maxWaitTimer.current) {
      clearTimeout(maxWaitTimer.current);
      maxWaitTimer.current = null;
    }
  }, []);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const setSafeStatus = useCallback((next: AutosaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const flush = useCallback(
    async (flushOptions?: FlushOptions) => {
      if (inFlight.current || !dirty.current) return;
      cancelDebounce();
      cancelMaxWait();

      const payload = getPayloadRef.current();
      inFlight.current = true;
      setSafeStatus("saving");
      try {
        await saveRef.current(payload, flushOptions);
        dirty.current = false;
        setSafeStatus("saved");
        cancelHold();
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          // Never downgrade a newer status — edits may have landed during
          // the hold window and re-marked the document dirty.
          if (!dirty.current && statusRef.current === "saved") {
            setSafeStatus("idle");
          }
        }, savedHoldMs);
      } catch {
        // The payload stays dirty — the next edit, keystroke or explicit
        // retry re-arms the debounce and tries again.
        setSafeStatus("error");
      } finally {
        inFlight.current = false;
        if (dirty.current) {
          debounceTimer.current = setTimeout(() => {
            debounceTimer.current = null;
            void flushRef.current();
          }, REFLUSH_MS);
        }
      }
    },
    [cancelDebounce, cancelMaxWait, cancelHold, savedHoldMs, setSafeStatus]
  );

  // Latest-ref sync — runs after every render, well before any timer or
  // unload handler could read the refs.
  useEffect(() => {
    getPayloadRef.current = getPayload;
    saveRef.current = save;
    flushRef.current = flush;
  });

  /** Ping on every keystroke / structural change — ref-only, no re-renders. */
  const notifyChange = useCallback(() => {
    const wasDirty = dirty.current;
    dirty.current = true;
    if (!wasDirty) {
      // The idle debounce below resets forever while the user keeps
      // typing; this timer runs once per dirty period and hard-caps the
      // data at risk when the debounce never gets a chance to fire.
      cancelMaxWait();
      maxWaitTimer.current = setTimeout(() => {
        maxWaitTimer.current = null;
        void flushRef.current();
      }, maxWaitMs);
    }
    if (statusRef.current === "idle" || statusRef.current === "saved") {
      setSafeStatus("dirty");
    }
    cancelHold();
    cancelDebounce();
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void flushRef.current();
    }, delay);
  }, [cancelDebounce, cancelHold, cancelMaxWait, delay, maxWaitMs, setSafeStatus]);

  /** Immediate flush attempt (error indicator click). */
  const retry = useCallback(() => {
    if (!dirty.current || inFlight.current) return;
    cancelDebounce();
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void flushRef.current();
    }, 0);
  }, [cancelDebounce]);

  // Flush when the tab is hidden — OS-level app switching can skip unload.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void flushRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Best-effort flush on page unload — keepalive outlives the document.
  useEffect(() => {
    const onUnload = () => {
      void flushRef.current({ keepalive: true });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // pagehide fires on BOTH reload and close and cannot be skipped the way
  // beforeunload can (browsers ignore beforeunload in several teardown
  // paths) — it is the most reliable "the page is going away" signal.
  useEffect(() => {
    const onHide = () => {
      void flushRef.current({ keepalive: true });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Flush pending changes when the editor unmounts (client-side route
  // navigation). Strict-mode dev double-mounts no-op on clean dirty state.
  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, []);

  // Cancel pending timers when the editor goes away for good.
  useEffect(() => {
    return () => {
      cancelDebounce();
      cancelMaxWait();
      cancelHold();
    };
  }, [cancelDebounce, cancelMaxWait, cancelHold]);

  return { status, notifyChange, flush, retry };
}
