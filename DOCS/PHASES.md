# Implementation Phases — jam-note

This document maps out a structured, 5-phase build order to take `jam-note` from zero to a polished, ready-to-deploy product. Each phase defines target features, technical milestones, and completion checklists.

---

## Phase 1: Foundations & Local Dev Setup (Sprint 1)
**Goal:** Establish local development loops, wire backend containerization/MongoDB configurations, and implement reliable authentication.

### Milestones
1. **Repository Setup:**
   - Configure workspaces, dependencies, and environment variables.
   - Configure local dev environment tools (`uv` for FastAPI, `pnpm` for Next.js).
2. **FastAPI & MongoDB Setup:**
   - Initialize MongoDB client with `motor` inside `src/fastapi_backend/database.py`.
   - Setup basic error handling and verification routes.
3. **Authentication Core:**
   - Create Pydantic auth models (`UserSignUp`, `UserLogin`, `UserOut`).
   - Implement route `POST /api/auth/signup` and `POST /api/auth/login`.
   - Implement HTTP-only Cookie JWT issuing mechanism and verify via curl or Swagger UI.
4. **Next.js Auth Integration:**
   - Build a clean, minimal, non-cliché Login/Signup page utilizing CSS/tailwind theme.
   - Implement client session context providers (`AuthContext`) and secure Route Guards.

### Verification Checklist
- [x] Backend runs with `fastapi dev` and returns 200 on Swagger `/docs`.
- [x] User can signup, log in, secure cookie is issued, and `/me` returns correct JSON.
- [x] Next.js app routes block unauthenticated users and redirect correctly.

---

## Phase 2: Document Index & Document Tree (Sprint 2)
**Goal:** Implement note document lifecycle, including sidebar indexes, nesting hierarchy structures, and folder management.

### Milestones
1. **Notes API Integration:**
   - Code `POST /api/notes` (creates a note, supports nesting under `parent_id`).
   - Code `GET /api/notes` (retrieves a flat tree list of documents owned by the active user).
   - Code `GET /api/notes/{note_id}` (retrieves note metadata and block contents).
   - Code `DELETE /api/notes/{note_id}` (including cascading check for orphaned child blocks).
2. **Next.js Dynamic Sidebar & Navigation:**
   - Implement a collapsible sidebar showing the tree structure of nested notes.
   - Use dynamic prefetching for note links using Next.js App Router capabilities.
   - Setup global search interface shortcut `Cmd+K` targeting `/api/notes/search` to instantly filter all note titles.

### Verification Checklist
- [x] Creating nested folders/notes in sidebar reflects instantaneously in the database.
- [x] Sidebar renders recursive hierarchy cleanly without layout shifting.
- [x] Dynamic `/notes/[id]` route correctly displays note page layouts.

---

## Phase 3: The Custom Slash-Command Editor (Sprint 3)
**Goal:** Build a robust, highly-tactile block-editor capable of block insertion, markdown styling, shortcuts, and real-time backend updates.

### Milestones
1. **Editor Engine Shell:**
   - Build custom block-level React rendering. Each block is an individual component.
   - Support slash `/` trigger command palette (inserts blocks of type headers, checklists, code snippets, drawings).
2. **Markdown Auto-Conversion:**
   - Pressing `# ` + Space converts the text block to H1 instantly. `- ` converts to list item, etc.
3. **Save Sync State Machine:**
   - Create debounced autosaving state machine: when block content is changed, show a quiet indicator ("Saving...") and patch JSON state to FastAPI `/api/notes/{note_id}`.
4. **Rich Content Embeds:**
   - Add drawing blocks (embed sketch-pads via SVG/Canvas), Code highlighting, and image blocks.

### Verification Checklist
- [x] Block list can be rearranged, new blocks added via `/` command, and typing behaves cleanly with zero lag.
- [x] Autosave executes in background without locking/jittering the user interface.
- [ ] Sub-70ms keypress-to-screen performance is met.

---

## Phase 4: The Spatial "Jam Canvas" (Sprint 4)
**Goal:** Introduce the standout creative canvas layout mode, letting users visualize their note elements in a flexible, 2D visual board.

### Milestones
1. **Canvas View Engine:**
   - Code "Layout Toggle" in note navigation: Standard Document View <=> Spatial Canvas View.
   - Implement absolute positioning coordinates (`x`, `y`, `width`, `height`) for blocks mapped inside MongoDB.
2. **Interactive Board Layout:**
   - Use simple mouse drag-and-drop actions for nodes.
   - Implement drag-connections to link notes (draw customizable SVG vectors between connected cards).
   - Implement resizing, group coloring, and scale zoom controls.

### Verification Checklist
- [ ] Switching between standard and canvas layouts preserves block coordinates and content.
- [ ] Zooming and panning is fluid and handles multiple block nodes without performance degradation.

---

## Phase 5: Landing Page & 3D Showcase (Sprint 5)
**Goal:** A high-quality marketing landing page with background 3D designs, scoped to its own palette — `#222831` / `#393E46` / `#FFD369` / `#EEEEEE` (colorhunt.co/palette/222831393e46ffd369eeeeee) — without disturbing the in-app neo-industrial theme.

### Milestones
1. **Route Architecture (prerequisite):**
   - `/` currently renders the authenticated `(app)` shell. Split it: unauthenticated visitors get the landing at `/`; logged-in users are redirected straight into the app (no marketing flash). The dashboard moves to its own route (e.g. `/dashboard`) inside the existing `(app)` group; `proxy.ts` guards and all internal links (`/` references in note-header, recent-notes, logout) are updated.
2. **Marketing Design System:**
   - Scoped CSS variables for the landing palette: `#222831` ground, `#393E46` panels, `#FFD369` amber-yellow accent, `#EEEEEE` text. Palette audit: a deliberate cousin of the in-app neo-industrial scheme (dark ground + yellow accent) so the brand reads consistently, but the marketing surface owns its own tokens.
   - Same typographic discipline as the app (mono labels, tight tracking, razor-thin borders) for brand continuity.
3. **3D Background:**
   - `react-three-fiber` (three.js) scene as the only new dependency, loaded via `next/dynamic` off the critical path so the text-first hero paints instantly; the 3D chunk streams in after LCP.
   - `prefers-reduced-motion` and no-WebGL environments render a static (CSS/canvas-2D) fallback.
4. **Page Sections:** hero (tagline + "Start free" CTA), feature grid (block editor, slash commands, Jam Canvas, publishing), product visuals (real screenshots — no fake mockups), pricing/free-tier statement, footer.
5. **SEO & Metadata:** page metadata + OpenGraph/Twitter cards, `sitemap.ts` + `robots.ts` (shared with Phase 6 public publishing), SoftwareApplication structured data.

### Verification Checklist
- [ ] Unauthenticated `/` shows the landing; authenticated users land directly in the app with no marketing flash.
- [ ] 3D loads lazily: static shell passes Lighthouse ≥ 90 / LCP < 2.5s; the three.js bundle never blocks first paint.
- [ ] `prefers-reduced-motion` and non-WebGL browsers get a static fallback.
- [ ] Fully responsive (360px → desktop) and keyboard navigable.

---

## Phase 6: Publishing Hub (CRM) & Aesthetics Polish (Sprint 6)
**Goal:** Build the news blog/CRM publishing layer, apply the custom neo-industrial aesthetics across all modules, and perform integration testing.

### Milestones
1. **Publishing Core & public CRM:**
   - Implement "Publish" settings pane for notes.
   - Create route `POST /api/pub/posts/{id}/publish` which generates slug-mapped entries.
   - Develop the unauthenticated public dynamic sub-app/route `apps/next-frontend/app/pub/[username]/[slug]` allowing readers to view notes.
2. **Neo-Industrial Theme Injection:**
   - Apply the specific visual styles (Off-black matte background, neon accents, razor-thin solid borders, strict typographic limits).
   - Run optimization checks and test compilation using Turbopack during development.

### Verification Checklist
- [ ] A note can be marked public and immediately accessed via standard public URL.
- [ ] CSS elements match the precise visual directions with non-templated typography and palette.
- [ ] The entire developer build passes compile checks and production-ready tests.

---

## Phase 7: Magic Search — Full-Text Across Note Contents (Sprint 7)
**Goal:** Search every word inside all of a user's notes ("magic search") and jump directly to the matching block, powered by the Aiven free-tier OpenSearch cluster (2 vCPU / 4GB RAM / 20GB storage).

### Milestones
1. **OpenSearch Client & Index Schema** (`src/fastapi_backend/search/`):
   - **Block-level documents** (one doc per block: `user_id`, `note_id`, `block_id`, `note_title`, `block_order`, `text`, `updated_at`) — block granularity is what makes "jump to the line" native and precise.
   - Connection via env-configured Aiven OpenSearch URL + credentials; health-checked like MongoDB (service degrades, never crashes).
2. **Write-Through Sync:**
   - On `PUT /api/notes/{id}` (blocks changed): delete-by-`note_id` + bulk-index that note's docs. On note create/delete/cascade: index/remove accordingly.
   - Index writes are fire-and-forget with logging — an OpenSearch outage must NEVER block or fail a database write.
   - `scripts/reindex.py` backfills the full index from MongoDB (idempotent, re-runnable).
3. **Search API:**
   - `GET /api/search?q=` (CurrentUserDep) — Lucene full-text with fuzziness (typos still match), per-`user_id` filter (multi-tenant isolation enforced at the index level), highlighted fragments returned with `note_id` + `block_id` + `note_title`.
   - The existing title-regex search remains the fallback when OpenSearch is unavailable.
4. **Palette Integration — "Jump to the Line":**
   - The ⌘K palette gains content results: note title + highlighted block snippet.
   - Enter navigates to `/notes/{id}#block-{block_id}`; the editor scrolls to the block and flashes it neon. Stable block ids make the deep-link shareable.
5. **Stretch — other OpenSearch uses** (decide after core ships; candidates from the viability audit):
   - Search-as-you-type autocomplete (edge n-grams) for the palette.
   - k-NN vector search for semantic "ask my notes" (free tier permits small-scale experiments).
   - Public publishing-site search (Phase 6 CRM pages).
   - Fuzzy phrase search / "similar notes" (more-like-this).
   - Aggregations for usage analytics (popular searches, most-edited notes).

### Verification Checklist
- [ ] Search finds text inside any block of any note, tolerating typos.
- [ ] Selecting a result opens the note scrolled to the exact block with a neon flash; the URL hash deep-links there.
- [ ] Multi-tenant isolation: no query ever returns another user's content.
- [ ] With OpenSearch down, saves and title search still work (graceful degradation).
- [ ] The reindex script rebuilds the full index from MongoDB; incremental sync is correct across create/update/delete.
