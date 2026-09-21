# Architecture & Technical Design — jam-note

This document details the software architecture, database design, and technical integration between the **Next.js Frontend**, the **FastAPI Backend**, and **MongoDB**.

---

## 1. High-Level Architecture Overview

```
                      +---------------------------------------+
                      |               User Agent              |
                      |        (Next.js Client Components)     |
                      +---+-------------------------------+---+
                          |                               |
        (1) HTTP / APIs   |                               | (2) Real-time WS / Event Stream
        (Auth, CRUD, Sync)|                               | (Graph & Collaboration)
                          v                               v
                      +---+-------------------------------+---+
                      |            Next.js App Server         |
                      |    (Server Components, ISR, Prefetch) |
                      +---+-----------------------------------+
                          |
                          | Proxy API Requests & Server-Side Calls
                          v
                      +---+-----------------------------------+
                      |            FastAPI Backend            |
                      |   (Python 3.14 + Uvicorn + MongoDB)   |
                      +---+-------------------------------+---+
                          |                               |
                          | ODM / Driver                      | File Storage (e.g. S3/MinIO)
                          v                               v
                      +---+-------------------+       +---+-------------------+
                      |    MongoDB Atlas      |       |      S3 / Asset       |
                      |  (User & Note Data)  |       |     Storage Bucket    |
                      +-----------------------+       +-----------------------+
```

### Stack Components
1. **Frontend:** Next.js (v16.3+), React 19, TypeScript, TailwindCSS, and pnpm. Utilizes the App Router with Partial Prefetching (PPR) and Cache Components.
2. **Backend:** FastAPI, Python 3.14, Pydantic v2. Fully asynchronous MongoDB connection via motor/pymongo.
3. **Database:** MongoDB (using motor async driver). A document-based DB is perfect for storing block hierarchies, nested trees, and flexible custom block configurations.
4. **Event stream:** Aiven Kafka, used for durable asynchronous domain events. Kafka is not the source of truth for notes.
5. **Workers:** Separate Python processes that publish outbox records or consume Kafka topics. MongoDB and Aiven do not provide these application workers.

---

## 2. Database Schema (MongoDB Documents)

Since MongoDB uses flexible BSON schemas, we will model our data carefully to balance performance (read/write speed) and structural querying (backlink tracking, infinite nesting).

### A. Users Collection (`users`)
Stores credential hashes, profile configurations, and custom visual settings.
```json
{
  "_id": "ObjectId",
  "email": "string (unique)",
  "password_hash": "string",
  "username": "string (unique)",
  "profile": {
    "display_name": "string",
    "avatar_url": "string"
  },
  "settings": {
    "theme": "dark-mono | retro-amber | industrial-steel",
    "editor_preferences": {
      "default_layout": "document | canvas",
      "font_family": "string",
      "font_size": "number"
    }
  },
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

### B. Notes & Canvas Documents Collection (`notes`)
Notes are content leaves (Phase 6, "Folders in Denial"): each note lives in zero or one folder via `folder_id`; nesting is owned by the `folders` collection below. Dev data was wiped at cutover (user decision — disposable), so no legacy `parent_id` migration ran; any stale `parent_id` still stored in Mongo is ignored by the API and never returned.

```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (indexed)",
  "folder_id": "ObjectId | null (indexed)",
  "color": "str | null — sidebar accent, palette key from fastapi_backend/notes/models.py#PALETTE_COLORS (validated; Phase 6 color coding)",
  "title": "string",
  "layout_type": "document | canvas",
  "emoji_icon": "string | null",
  "cover_image": "string | null",
  "blocks": [
    {
      "id": "string (UUID)",
      "type": "text | header-1 | header-2 | header-3 | code | image | todo | list-item | canvas-node",
      "properties": {
        "text": "string",
        "language": "string | null",
        "checked": "boolean | null",
        "src": "string | null"
      },
      "canvas_metadata": {
        "x": "number",
        "y": "number",
        "width": "number",
        "height": "number",
        "color": "string"
      }
    }
  ],
  "links_to": ["ObjectId"],
  "backlinks": ["ObjectId"],
  "is_published": "boolean (indexed)",
  "published_metadata": {
    "slug": "string (unique/indexed, custom URL path)",
    "headline": "string",
    "published_at": "ISODate",
    "view_count": "number"
  },
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

### B2. Folders Collection (`folders`)
Pure containers (Phase 6): folders nest folders and hold notes; they carry no content of their own and have no route or page. Deleting a folder lifts its contents to its parent — never cascades; moves reject cycles.

```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (indexed)",
  "parent_folder_id": "ObjectId | null (indexed)",
  "name": "string (1..200, stripped)",
  "order": 0,
  "color": "str | null — sidebar accent, palette key from PALETTE_COLORS (validated; Phase 6 color coding)",
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

`order` ships reserved but unused — ordering is `created_at` everywhere (user decision).

---

### C. Event Outbox Collection (`event_outbox`)
The outbox keeps a successful MongoDB mutation paired with its event. The note
mutation and outbox insert must be committed together. This internal collection
is never exposed through the API.

```json
{
  "_id": "ObjectId",
  "event_id": "UUID (unique)",
  "event_type": "note.changed | note.deleted | note.published",
  "schema_version": 1,
  "aggregate_type": "note",
  "aggregate_id": "ObjectId",
  "user_id": "ObjectId",
  "payload": {
    "changed_fields": ["blocks"],
    "updated_at": "ISODate"
  },
  "status": "pending | publishing | published | failed",
  "attempts": 0,
  "available_at": "ISODate",
  "claimed_at": "ISODate | null",
  "published_at": "ISODate | null",
  "last_error": "string | null",
  "created_at": "ISODate"
}
```

The Go streamer claims candidate records atomically, publishes a clean event
envelope to `jam-note.note-events.v1`, and marks the outbox record published
only after Kafka acknowledges the message. Failed records become replayable
dead-letter records. A lease on `claimed_at` allows recovery after a crash.
Delivery is at-least-once, so downstream consumers must be idempotent using
`event_id` and a stable target id such as `aggregate_id:block_id`.

## 3. Backend Architecture (FastAPI)

Following standard FastAPI modular layout.

### Directory Structure
```
fastapi-backend/
├── src/
│   └── fastapi_backend/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── auth/
│       │   ├── router.py
│       │   ├── dependencies.py
│       │   └── service.py
│       ├── notes/
│       │   ├── router.py
│       │   ├── models.py      # Pydantic schemas
│       │   └── service.py
│       ├── folders/
│       │   ├── router.py
│       │   ├── models.py      # Folder schemas + WorkspaceOut
│       │   └── service.py
│       ├── events/
│       │   ├── schemas.py       # Versioned domain-event payloads
│       │   ├── outbox.py        # Transactional outbox writes and claiming
│       │   └── producer.py      # Aiven Kafka producer configuration
│       ├── publishing/
│       │   ├── router.py
│       │   └── service.py
│       └── utils/
```

### Key API Routes
* **Auth Endpoint (`/api/auth`)**:
  * `POST /signup` - Registers a new user.
  * `POST /login` - Issues HTTP-Only JWT tokens.
  * `POST /logout` - Clears the session.
  * `GET /me` - Returns logged-in user profile.
* **Notes Engine (`/api/notes`)**:
  * `GET /` - Fetches the flat index of the user's notes (leaves; nesting lives in folders).
  * `POST /` - Creates a new note (as document or canvas, optionally inside a folder via `folder_id`).
  * `GET /{note_id}` - Retrieves a single note's full block contents.
  * `GET /search?q=` - Title search used by the ⌘K palette.
  * `PUT /{note_id}` - Updates a note's blocks/meta (including `folder_id` moves and the `color` sidebar accent — omitted vs explicit-null distinguishes "keep" from "clear"). **Shipped:** sends the full ordered `blocks` array (delta/JSON-patch syncing deliberately deferred until documents grow — see MEMORY.md Phase 3).
  * `DELETE /{note_id}` - Deletes a note (leaves — no children to lift).
* **Folders Engine (`/api/folders`)**:
  * `POST /` - Creates a folder (optionally inside another via `parent_folder_id`).
  * `GET /` - Lists the user's folders (flat, `created_at` asc).
  * `GET /{folder_id}` - Retrieves a single folder.
  * `PUT /{folder_id}` - Renames and/or moves a folder (distinguishes omitted vs explicit `null`; rejects cycles) and/or sets its `color` accent.
  * `DELETE /{folder_id}` - Deletes the folder, lifting contents to its parent (never cascades).
* **Workspace (`/api`)**:
  * `GET /workspace` - Combined folder + note tree for the sidebar: `{folders: [FolderTreeItem], notes: [NoteListItem]}`, folders-before-notes at every level, each list `created_at` asc. (Replaces the removed `GET /api/notes/trees`.)
* **Publishing Engine (`/api/pub`)**:
  * `GET /posts` - Returns list of public posts for a given username.
  * `GET /posts/{slug}` - Public-facing unauthenticated route to fetch single post content.
  * `POST /posts/{note_id}/publish` - Converts note to a public post, configures slug/headline.

---

## 4. Frontend Architecture (Next.js)

Leverages a hybrid rendering model where UI skeleton frames are generated instantly on the server, while the editor interface utilizes local-first client hydration.

### Key Concepts
1. **Partial Prefetching (PPR):**
   - The shell layout, sidebar list (folders, notebook index), and command bar are statically prefetched.
   - The note viewport `/notes/[id]` wraps the dynamic content block inside a React `<Suspense>` boundary.
2. **Editor Engine:**
   - Client Component utilizing state machines to manage active blocks.
   - Dynamic layout switching between Standard Flow (standard markdown list) and Spatial Canvas (absolute layouts synced back with coordinates).
3. **Optimistic UI Upgrades:**
   - Local state is modified instantly upon typing, with keypress throttling.
   - Changes are queued and pushed to FastAPI `/api/notes/{id}` in debounced batches. **Shipped:** a 10s idle debounce plus a 30s max-wait cap (never flushed on block blur — caret hops between blocks fire blur constantly), safety flushes on `visibilitychange`/`pagehide`/`beforeunload` (fetch `keepalive`), and a localStorage draft mirror that recovers unsaved edits after crashes.

---

## 5. Security Design & Key Policies

1. **JWT in HTTP-Only Cookies:** 
   - No direct localStorage/sessionStorage access to JWTs to prevent XSS-based credential theft.
2. **Strict DB Owner Filters:**
   - Every DB operation implicitly appends the `user_id` context resolved from the auth dependency. No user can ever query, update, or read notes belonging to another user.
3. **CORS Configuration:**
   - Restrict FastAPI backend CORS strictly to the Next.js origin.

## 6. Eventing, Outbox, and Worker Model

### Write path
For a note create, update, delete, or publish operation, FastAPI performs the
business mutation and inserts the corresponding outbox event in the same
MongoDB transaction. MongoDB remains authoritative; a Kafka outage must not
make the user lose a successfully accepted note update.

Standalone MongoDB deployments do not support the transactions required for a
strict cross-document atomic write. Production outbox mode should therefore use
MongoDB Atlas or a replica-set deployment. Until then, local development can
use Kafka-disabled tests plus reconciliation/reindex tooling.

### What the worker is
The worker is not supplied by MongoDB or Aiven. It is a separately deployed Go
daemon in the `outbox-streamer` service, running on AlwaysData as a persistent
service with `Idle time = 0`.

```text
./streamer
```

It uses MongoDB Change Streams only to generate low-latency candidates. A
reconciliation loop independently scans pending records, expired publishing
leases, and replayable failed records. The publisher atomically claims each
candidate, publishes the complete event envelope to Kafka, updates MongoDB,
and persists the resume token only after successful delivery.

### Kafka consumers
The OpenSearch indexer is a separate consumer process with its own Kafka
consumer group, for example `jam-note-search-indexer`. Future consumers use
different groups, allowing the same event stream to independently feed search,
analytics, notifications, or publishing workflows. Consumers must preserve
tenant isolation using `user_id`.

### Delivery and recovery rules

1. Events are published at least once; consumers must be idempotent.
2. Failed outbox records remain in MongoDB for explicit replay/reset and
  monitoring; this is the initial dead-letter store.
3. `scripts/reindex.py` remains available to rebuild OpenSearch from MongoDB.
4. Reconciliation covers pending, expired publishing, and replayable failed
  records without deleting unacknowledged events.
5. Kafka credentials and CA certificates are backend/worker secrets only; the
  Next.js browser never connects directly to Kafka.
6. Heartbeats are operational `system.heartbeat` events, sent at startup with
  retry backoff and every six hours thereafter to satisfy Aiven inactivity
  requirements. Consumers ignore them for domain processing.
