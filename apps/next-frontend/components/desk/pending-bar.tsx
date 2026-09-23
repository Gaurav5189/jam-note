"use client";

import { usePending } from "@/lib/pending-bar";

/**
 * The top loading bar — visible whenever a tracked request is in
 * flight (any button-press that talks to the API). Gold sweep on ink,
 * desk theme; reduced motion gets a static held segment instead of
 * the animation.
 */
export function PendingBar() {
  const pending = usePending();
  return (
    <div
      className={`pend-bar${pending ? " is-on" : ""}`}
      role="status"
      aria-label={pending ? "Working" : undefined}
    />
  );
}
