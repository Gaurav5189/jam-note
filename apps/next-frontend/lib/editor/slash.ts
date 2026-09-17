// ─── Slash-command text surgery ──────────────────────────────────────────
//
// Pure helpers for the slash-command flow, kept UI-free (like the other
// lib/editor modules) so they stay unit-testable in the node environment.

/**
 * Text remaining in the anchor block after removing the `/query` command.
 * `slashOffset` is where the `/` landed; `query` is the filter text typed
 * after it (possibly empty).
 */
export function stripSlashCommand(
  text: string,
  slashOffset: number,
  query: string
): string {
  return (
    text.slice(0, slashOffset) + text.slice(slashOffset + 1 + query.length)
  );
}
