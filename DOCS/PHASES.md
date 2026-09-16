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
- [ ] Backend runs with `fastapi dev` and returns 200 on Swagger `/docs`.
- [ ] User can signup, log in, secure cookie is issued, and `/me` returns correct JSON.
- [ ] Next.js app routes block unauthenticated users and redirect correctly.

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
- [ ] Creating nested folders/notes in sidebar reflects instantaneously in the database.
- [ ] Sidebar renders recursive hierarchy cleanly without layout shifting.
- [ ] Dynamic `/notes/[id]` route correctly displays note page layouts.

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
- [ ] Block list can be rearranged, new blocks added via `/` command, and typing behaves cleanly with zero lag.
- [ ] Autosave executes in background without locking/jittering the user interface.
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

## Phase 5: Publishing Hub (CRM) & Aesthetics Polish (Sprint 5)
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
