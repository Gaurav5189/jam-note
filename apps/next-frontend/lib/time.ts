/**
 * Timestamp normalization + display for the API's ISO strings.
 *
 * The backend stores tz-aware UTC (`datetime.now(timezone.utc)`), but
 * pymongo returns NAIVE datetimes, so the API emits ISO WITHOUT a Z or
 * offset — and browsers parse naive ISO as LOCAL time. A freshly saved
 * note therefore read as "5H AGO" in UTC+5:30. Standard technique,
 * applied here: normalize to UTC at parse time, then let the browser's
 * own locale/timezone own every display conversion (store UTC, render
 * local — never hand-roll offsets).
 */

/** True when the string already carries a timezone designator. */
function hasTimezone(iso: string): boolean {
  return /[Zz]$/.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso);
}

/**
 * Parse an API timestamp as UTC. Naive strings get an explicit "Z";
 * strings that already carry an offset are used as-is.
 */
export function parseApiDate(iso: string): Date {
  return hasTimezone(iso) ? new Date(iso) : new Date(`${iso}Z`);
}

/**
 * Relative stamp for the note header bar. Falls back to the
 * deterministic YYYY-MM-DD slice past a week (or on a bad parse).
 */
export function formatRelativeStamp(iso: string, now: number): string {
  const t = parseApiDate(iso).getTime();
  if (!Number.isNaN(t)) {
    const secs = Math.max(0, Math.floor((now - t) / 1000));
    if (secs < 60) return "JUST NOW";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}M AGO`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}H AGO`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}D AGO`;
  }
  return iso.slice(0, 10);
}

/**
 * Full local date + time (e.g. "21 Sep 2026, 14:32") in the browser's
 * locale and timezone. Only call this after mount: the server can't
 * know the visitor's timezone, so SSR must stick to UTC slices and the
 * swap must happen client-side to avoid hydration drift.
 */
export function formatLocalDateTime(iso: string): string {
  return parseApiDate(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
