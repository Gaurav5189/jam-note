import type { Metadata } from "next";
import { ReconnectButton } from "./reconnect-button";

export const metadata: Metadata = {
  title: "Jam Notes — Offline",
  // Functional service-worker fallback, not a content page — keep it out of
  // the index (robots.ts disallows it too).
  robots: { index: false },
};

const HEADING = "You're working offline.";
const COPY =
  "The console can't reach the network right now. Unsaved changes " +
  "stay queued on this device and flush to the server automatically " +
  "once the connection returns.";

/**
 * Offline fallback page served by the service worker when a navigation
 * fails and no cached copy of the URL exists. Statically prerendered so
 * the worker can cache it at install time. Public (proxy-exempt) because
 * it must be reachable without a session.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background-base px-6">
      <section className="w-full max-w-[75ch] border border-border-thin bg-background-panel p-8 sm:p-10">
        <p className="font-mono text-xs tracking-[0.25em] text-accent-amber">
          NO CARRIER
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-text-primary">
          {HEADING}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          {COPY}
        </p>
        <div className="mt-8">
          <ReconnectButton />
        </div>
      </section>
    </main>
  );
}
