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
Using a parent-child adjacency list representation. This allows infinite nesting without deep document overhead.
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (indexed)",
  "parent_id": "ObjectId | null (indexed)",
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

---

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
  * `GET /` - Fetches the directory tree/index of notes.
  * `POST /` - Creates a new note (as document or canvas).
  * `GET /{note_id}` - Retrieves a single note's full block contents.
  * `PUT /{note_id}` - Updates a note's blocks/meta. Supports JSON patch / optimistic delta syncing.
  * `DELETE /{note_id}` - Deletes a note and cleanly detaches parent/child pointers.
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
   - Changes are queued and pushed to FastAPI `/api/notes/{id}` in debounced batches (500ms inactivity or on focus changes).

---

## 5. Security Design & Key Policies

1. **JWT in HTTP-Only Cookies:** 
   - No direct localStorage/sessionStorage access to JWTs to prevent XSS-based credential theft.
2. **Strict DB Owner Filters:**
   - Every DB operation implicitly appends the `user_id` context resolved from the auth dependency. No user can ever query, update, or read notes belonging to another user.
3. **CORS Configuration:**
   - Restrict FastAPI backend CORS strictly to the Next.js origin.
