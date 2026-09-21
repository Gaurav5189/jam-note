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

/**
 * The live slash query for a block's current text.
 *
 * The query is the WORD starting right after the `/` — bounded by the
 * first whitespace — so opening the menu mid-sentence keeps filtering
 * even though prose follows the caret (the whole rest of the line is
 * NOT the query). A whitespace immediately after the slash (`/ `) is
 * the established "close the menu, keep the text" gesture and reports
 * `dismissed: true`.
 */
export function slashQueryAfter(
  text: string,
  slashOffset: number
): { query: string; dismissed: boolean } {
  const after = text.slice(slashOffset + 1);
  const spaceIdx = after.search(/\s/);
  if (spaceIdx === 0) {
    return { query: "", dismissed: true };
  }
  if (spaceIdx === -1) {
    return { query: after, dismissed: false };
  }
  return { query: after.slice(0, spaceIdx), dismissed: false };
}
