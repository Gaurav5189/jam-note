# Product Requirements Document (PRD) — jam-note

## 1. Product Vision & Subject Matter

`jam-note` is a highly interactive, fast, and visually arresting note-taking platform designed for developers, creatives, and modern teams who find traditional options (like Notion) too clinical, slow, or rigid. 

By marrying the structure of block-based nesting with the fluidity of an audio synthesizer or game, `jam-note` turns note-taking from a chore into a creative act. It features dynamic canvas-like workspaces, seamless keyboard-driven markdown editing, and deep customization (themes, flexible schemas, and instant layout modifications) that let users jam on their thoughts.

The user-facing display brand is **Jam Notes** (UI headers, browser tab titles, social share cards); `jam-note` remains the repository and package name.

### Target Audience & Tone
- **Audience:** Developers, designers, writers, and technical creators who care deeply about aesthetic execution, speed, keyboard ergonomics, and extensibility.
- **Tone:** Technical, expressive, intentional, tactile. Less "enterprise productivity tool", more "high-end physical notebook meets retro-synthesizer".

---

## 2. Core Functional Requirements

### A. Authentication & User Management
* **Multi-tenant Accounts:** Secure user signup, login, password recovery, and session management.
* **Personal Sandbox:** Every user has their own private workspace, and no data is shared with other users by default.
* **Profile Customization:** User preferences (default themes, keyboard layout profiles, and custom CSS modifiers).

### B. Note & Document Engine ("Flexible Blocks")
* **Infinite Nesting:** Documents can contain sub-documents nested to any depth, represented dynamically in both a sidebar and a spatial canvas mode.
* **Block-based Editor:** A highly responsive, slash-command (`/`) block editor supporting:
  * Markdown rendering (headers, lists, tables, task lists, code blocks).
  * Interactive components (calculators, color pickers, task boards, mind map nodes).
  * Draggable layout blocks (side-by-side columns, expandable toggles).
* **Rich Assets:** Audio clips, custom drawings/excalidraw canvas embed, high-performance image and file block uploads.
* **Bidirectional Backlinks:** Notes can link to other notes (using `[[note-name]]`), generating an interactive backlink graph.

### C. The Spatial "Jam Canvas" (Differentiating Feature)
* **Beyond Linear Text:** Users can toggle any note from "Document View" (standard vertical scrolling block editor) to "Canvas View" (infinite spatial canvas) where child notes and blocks are represented as cards they can arrange, connect with lines, color-code, and resize.
* **Canvas Workspaces:** Create custom dashboards, flowcharts, or visual moodboards within their notes.

### D. The CRM / Publishing Hub (The "Public News Feed")
* **Self-Publishing Engine:** Since note-taking tools are often used to write public content, `jam-note` includes an integrated public blog/news publishing engine.
* **Publishing Toggle:** With one click, any sub-folder or tag of notes can be published as a public-facing website/blog ("Public News Channel").
* **Public CRM Panel:** An administrative board where the user can manage their published notes, edit headlines, track view counters, schedule post releases, and customize the layout of their public page.
* **Reader Access:** Public readers can view the published notes feed without needing an account.

### E. Advanced search & Graph Navigation
* **Instant Command Palette:** Global fuzzy search via `Cmd+K` or `Ctrl+K`.
* **Visual Graph Mode:** A 3D or high-performance 2D Canvas visualizing the user's entire note network, showing notes as nodes and links as edges.

---

## 3. Non-Functional & Technical Requirements

### A. Performance & Interaction Speed
* **Sub-50ms Interaction Latency:** Block insertions, focus switches, and typing must feel instant.
* **Optimistic Updates:** Frontend must assume write success on backend, syncing in the background with local-first fallback mechanisms.
* **Prerendering & Streaming (Next.js 16.3+):** Leverage Partial Prefetching (PPR) and Cache Components so that the dashboard shell, sidebar, and core layout load instantly, with content streaming in via React Suspense boundaries.

### B. Security & Privacy
* **Data Isolation:** Complete logical isolation of user data at the MongoDB query and schema level.
* **Authentication:** Stateless JWT or Session-based secure token authentication with encrypted HTTP-only cookies.
* **Sanitization:** Strict sanitization of all custom HTML block injections to prevent XSS.

### C. Reliability & Database
* **Database:** MongoDB. Scalable document schema for blocks to handle flexible nested tree structures.
* **State Syncing:** Delta/operational-transform or robust JSON-patch sync between local editor state and FastAPI to handle intermittent offline situations.

---

## 4. Visual & Aesthetic Requirements (Frontend Design)

To stand out from templated, clinical lookalikes, `jam-note` adopts a **Neo-Industrial / Audio-Rack / Tactile Terminal** design system:

* **Backgrounds:** Off-black matte surfaces (`#0D0E11`, `#14161C`) combined with dark graphite steel panels (`#1D2027`). Avoid generic warm cream or flat `#000000` dark-modes.
* **Accents:** Electric neon yellow/green (`#D1FF4D`) and high-impact cyber-amber (`#FFB800`) used sparingly and with absolute restraint. No gradients or soft colored shadows.
* **Typography:** 
  * Headings & UI Labels: Inter / Geist Sans for precision, or a subtle technical Monospace (e.g., Geist Mono, JetBrains Mono) for status elements and buttons.
  * Body Text: Standard serif (e.g., Lora or Merriweather) or high-readability sans-serif, capped at exactly **75 characters per line** for effortless reading.
* **Borders & Rules:** Razor-thin solid borders (`1px solid #2A2F3D`) instead of drop-shadows. Card corners use a tight, disciplined radius (e.g., `4px` or `6px`) rather than pill-shapes or bloated standard rounding.

---

## 5. Excluded/Future Scope (V2)
* Multi-user concurrent real-time editing (Google Docs style socket-clash cursor syncing). V1 uses optimistic last-write-wins with delta-state diffs.
* Native mobile applications (V1 will be a highly responsive progressive web app).
* Full offline local-first CRDT database engines. (We will use indexedDB for local caching, but centralized DB-first authority).
