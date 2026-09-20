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
3. **Editor Polish — Markdown Paste Parsing:**
   - Extend `lib/editor/markdown.ts` with a paste parser + a paste handler in the block component (typing triggers like `# `/`[] `/```` ``` `` already convert live; pasted chunks currently land as literal text).
   - Multi-line paste auto-detects markdown structure and splits into typed blocks: `#`/`##` → headings, `-`/`*` → list items, `[ ]`/`[x]` → todos, fenced code regions → code blocks, plain lines → text blocks.
   - Single-line and plain-text pastes stay inline exactly as today — only structured multi-line chunks are parsed.

### Verification Checklist
- [x] Switching between standard and canvas layouts preserves block coordinates and content.
- [x] Zooming and panning is fluid and handles multiple block nodes without performance degradation.
- [x] Pasting a markdown document splits into correctly typed blocks (headings, lists, todos, code); plain-text and single-line pastes behave exactly as before.

---

## Phase 5: Landing Monograph (Sprint 5)
**Goal:** A high-quality public marketing monograph at `/`, built from paper stock, process black, Riso Red annotation ink, and one spatial Flat Gold Module Rack plate. The locked implementation record is `make/landing_page_DESIGN.md`.

### Milestones
1. **Route Architecture (prerequisite):**
   - `/` currently renders the authenticated `(app)` shell. Split it: unauthenticated visitors get the landing at `/`; logged-in users are redirected straight into the app (no marketing flash). The dashboard moves to its own route (e.g. `/dashboard`) inside the existing `(app)` group; `proxy.ts` guards and all internal links (`/` references in note-header, recent-notes, logout) are updated.
2. **Marketing Design System:**
   - Route-scoped paper monograph tokens: `#f3efe6` paper, `#faf7ef` sheet, `#151310` ink, `#ff3d1c` Riso Red, and `#ffb511` Flat Gold on the spatial rack only.
   - Archivo, Newsreader, and Space Mono; 1.5px print rules; square corners; hard positive-offset shadows; crop marks, grain, registration cursor, running head, and progress rule.
3. **Interaction and Motion:**
   - Split-glyph hero intro followed by the cursor-proximity Archivo weight/width field; reduced motion stays fully readable without motion.
   - Spread 03 title plate followed by the v1.2 spatial Module Rack; no film strip, draggable cards, 3D scene, or pointer color trail.
4. **Page Sections:** hero with `YOUR CONSOLE` login CTA; accessible Modes specimens; six-row Terms and clip-out coupon; colophon navigation.
5. **SEO & Metadata:** page metadata + OpenGraph/Twitter cards, `sitemap.ts` + `robots.ts` (shared with Phase 6 public publishing), SoftwareApplication structured data.

### Verification Checklist
- [x] Unauthenticated `/` shows the landing; authenticated users land directly in the app with no marketing flash. — **Verified**: HTTP smoke test — `/` returns 200; `/dashboard` without a cookie redirects 307 → `/login`; `/` with a `jam_session` cookie redirects 307 → `/dashboard`.
- [x] The final monograph replaces the retired 3D landing and legacy rack interactions. The current source of truth is `make/landing_page_DESIGN.md`.
- [x] Reduced-motion users receive static, fully readable content; the hero cursor field, spatial parallax, and reveal timing are disabled.
- [x] Fully responsive and keyboard navigable: visible focus rings, arrow-key Modes tabs, focusable panel, accessible spatial specimens, and a polite coupon redirect status.

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

### Phase 7.1: Durable Event Pipeline — MongoDB Outbox to Aiven Kafka
**Goal:** Make search indexing and future asynchronous features reliable without
making Kafka the source of truth or allowing Kafka downtime to break note saves.

#### Architecture

```text
FastAPI request
    -> MongoDB note mutation + event_outbox insert
    -> outbox publisher worker
    -> Aiven Kafka: jam-note.note-events.v1
    -> independent consumers: OpenSearch, analytics, notifications, etc.
```

The worker is an application-owned Go daemon on AlwaysData, not a MongoDB or
Aiven feature. MongoDB Change Streams generate fast-path candidates, while a
two-minute reconciliation loop is the durable recovery path. The publisher
atomically claims candidates, publishes a clean event envelope using the
configured Aiven authentication mode, marks records published only after Kafka
acknowledges them, and persists the resume token only after successful delivery.

#### Milestones

1. Add an `event_outbox` MongoDB collection with versioned event types, status,
   attempt count, lease timestamps, retry availability, and error details.
2. Write note mutations and their outbox records atomically using MongoDB
   transactions. Require MongoDB Atlas or a replica-set deployment for this
   mode; keep local mock tests independent of Kafka.
3. Add the Python FastAPI transaction/outbox writer with tenant-safe filters;
   standardize on `note.changed` and the canonical snake_case event schema.
4. Add the Go AlwaysData streamer with atomic publisher claims, bounded retry,
   lease recovery, and a persistent MongoDB resume token. MongoDB is the
   initial dead-letter store; a Kafka dead-letter topic can be added later.
5. Add startup and six-hour operational heartbeats with retry backoff for
   Aiven's inactivity policy; consumers ignore `system.heartbeat` events.
6. Add failed-event replay/reset tooling and monitoring. Failed records remain
   in MongoDB until explicitly replayed or archived.
7. Define `event_id` and stable target-idempotency rules so consumers tolerate
   Kafka's at-least-once delivery.
8. Keep `scripts/reindex.py` as the final OpenSearch recovery path.

#### Initial event contract

Use the note id as the Kafka key to preserve ordering for one note within a
partition. Start with compact metadata events rather than copying full note
documents into Kafka:

```json
{
  "event_id": "UUID",
   "event_type": "note.changed",
  "schema_version": 1,
  "user_id": "user-id",
  "note_id": "note-id",
  "changed_fields": ["blocks"],
  "updated_at": "ISODate"
}
```

Kafka receives this event envelope, not the internal outbox status fields such
as `claimed_at`, `published_at`, or `error_reason`. Use `note_id` as the Kafka
key so events for one note retain partition ordering. OpenSearch block ids use
`note_id:block_id`; `event_id` is used for event deduplication.

#### Verification checklist

- [ ] A note update and its outbox event are committed together on replica-set/Atlas MongoDB.
- [ ] A Kafka outage does not fail an already committed note update.
- [ ] The publisher retries failed records and reclaims leases after worker crashes.
- [ ] Duplicate delivery does not create duplicate OpenSearch state.
- [ ] A dead-letter event and structured error are produced after retry exhaustion.
- [ ] Replay/reconciliation restores downstream state from MongoDB.
- [ ] FastAPI writes note data and the outbox event in one Atlas/replica-set transaction with an owner filter.
- [ ] Go `test`, `vet`, and `build` checks pass, including duplicate, crash, Kafka outage, lease, and Error 286 scenarios.

### Milestones
1. **OpenSearch Client & Index Schema** (`src/fastapi_backend/search/`):
   - **Block-level documents** (one doc per block: `user_id`, `note_id`, `block_id`, `note_title`, `block_order`, `text`, `updated_at`) — block granularity is what makes "jump to the line" native and precise.
   - Connection via env-configured Aiven OpenSearch URL + credentials; health-checked like MongoDB (service degrades, never crashes).
2. **Kafka-Driven Index Sync:**
   - Consume `note.changed`, `note.deleted`, and `note.published` events from Kafka using a dedicated OpenSearch consumer group.
   - On `note.changed` (blocks changed): delete-by-`note_id` + bulk-index that note's docs. On note create/delete/cascade: index/remove accordingly.
   - OpenSearch outages pause/retry the consumer and NEVER block or fail a MongoDB note write.
   - `scripts/reindex.py` backfills the full index from MongoDB (idempotent, re-runnable).
3. **Search API:**
   - `GET /api/search?q=` (CurrentUserDep) — Lucene full-text with fuzziness (typos still match), per-`user_id` filter (multi-tenant isolation enforced at the index level), highlighted fragments returned with `note_id` + `block_id` + `note_title`.
   - Graceful degradation (decided): when OpenSearch is unavailable, the palette falls back to the existing title-regex search and shows a small amber "magic search offline" chip — saves and everything else keep working.
4. **Palette Integration — "Jump to the Line"** (decided: unified results):
   - One search box, no modes or tabs: title matches rank first, then content matches render as note title + highlighted block snippet.
   - Enter navigates to `/notes/{id}#block-{block_id}`; the editor scrolls to the block and flashes it neon. Stable block ids make the deep-link shareable.
5. **Stretch uses** (decided scope — all ride the same cluster, in priority order):
   - Search-as-you-type autocomplete (edge n-grams) in the palette — first stretch, cheap on the same index.
   - k-NN vector search for semantic "ask my notes" — needs an embeddings source; verify free-tier capacity before committing.
   - "Similar notes" (more-like-this) suggestions on the note page.
   - Aggregations for usage analytics (popular searches, most-edited notes — internal dashboard).

### Verification Checklist
- [ ] Search finds text inside any block of any note, tolerating typos.
- [ ] Selecting a result opens the note scrolled to the exact block with a neon flash; the URL hash deep-links there.
- [ ] Multi-tenant isolation: no query ever returns another user's content.
- [ ] With OpenSearch down, saves and title search still work (graceful degradation).
- [ ] The reindex script rebuilds the full index from MongoDB; incremental sync is correct across create/update/delete.
