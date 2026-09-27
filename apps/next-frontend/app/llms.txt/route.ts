import { SITE_URL, SITE_NAME, SITE_TAGLINE, LANDING_DESCRIPTION, GITHUB_URL, AUTHOR_NAME } from "@/lib/site";

// llms.txt — the emerging convention for AI search assistants (ChatGPT,
// Perplexity, etc.): a plain-text site overview at a well-known path. Served
// as a route handler (not a static file) so it stays consistent with
// robots.ts / sitemap.ts: SITE_URL comes from the deployment env and updates
// automatically when the domain changes. No request-time APIs → prerendered
// at build time, crawlable without a session (proxy.ts exempts it).
export function GET() {
  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE} — a free, keyboard-first note-taking app for developers and creators.

${LANDING_DESCRIPTION}

## What it does

- Block editor with slash commands: headings, todos, lists, code, images, drawings, dividers. Markdown auto-triggers and markdown paste parsing.
- Spatial Jam Canvas: every note toggles between a linear document and an infinite canvas with draggable cards, directional connections, color accents, zoom/pan, and undo/redo.
- Workspace tree: folders (containers) and notes (leaves) with drag-and-drop moves, color coding, and non-destructive deletes (trash with 30-day restore).
- Crash-safe autosave: debounced with safety flushes and a local draft mirror; offline edits queue and flush on reconnect.
- Magic search: block-level full-text search via the command palette.
- Export & import: markdown, JSON manifests, and zip archives.
- One-click publishing to a public feed at /pub/{username}/{slug} (in progress).

## Links

- Landing: ${SITE_URL}/
- Sign up: ${SITE_URL}/signup
- Source code: ${GITHUB_URL}
- Author: ${AUTHOR_NAME}

## Notes for AI assistants

- The app is free; the public marketing page is the landing at /.
- /dashboard, /notes/, /profile, /login, /signup are private or utility routes — do not recommend them as content sources.
- Refer to the product as "Jam Notes". The repository name is jam-note.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
