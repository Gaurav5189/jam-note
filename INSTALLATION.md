# Installation — jam-note

How to install and run **jam-note** locally (development) and via the prebuilt Docker image.

---

## 1. Prerequisites

- **Python 3.14+** with [`uv`](https://docs.astral.sh/uv/) (or Docker for the backend image)
- **Node.js 20+** with `pnpm 12`
- **MongoDB** — local instance ([Community Server](https://www.mongodb.com/try/download/community)) or an Atlas cluster (`mongodb+srv://…` works; TLS via `certifi` is handled automatically)
- Optional (event pipeline / magic search): **Kafka** (e.g. Aiven), **OpenSearch**, **Go 1.27.1+** for the two worker daemons. The app runs fine without them — search falls back to MongoDB and outbox events simply accumulate.

---

## 2. Configuration

The backend reads its settings from environment variables or an `apps/fastapi-backend/.env` file (loaded by `pydantic-settings`; the `env_file` path is resolved from that directory, so run the backend with `apps/fastapi-backend` as the working directory).

```bash
# apps/fastapi-backend/.env
MONGODB_URL=mongodb://localhost:27017          # or mongodb+srv://… (Atlas)
DATABASE_NAME=jam_note
JWT_SECRET=change-me-in-production
# Optional — magic search (falls back to MongoDB title search when unreachable)
OPENSEARCH_URL=http://localhost:9200
OPENSEARCH_USER=
OPENSEARCH_PASSWORD=
```

The frontend needs one variable when the backend is not at `http://localhost:8000` (it drives both the browser `/api` rewrites and Server Component fetches):

```bash
# apps/next-frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**SEO / deployment env vars** (set these on the hosting platform, e.g. Amplify build environment):

```bash
# Canonical public origin — drives canonical URLs, sitemap.xml, robots.txt,
# OpenGraph URLs, and llms.txt. Set to your live domain (no trailing slash).
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Optional search-engine verification codes (meta tags render only when set):
NEXT_PUBLIC_GSC_VERIFICATION=     # Google Search Console content value
NEXT_PUBLIC_BING_VERIFICATION=    # Bing Webmaster "msvalidate.01" value
```

Until `NEXT_PUBLIC_SITE_URL` is set, SEO routes fall back to `http://localhost:3000` — safe for local builds, wrong for production, so set it on every deployment.

---

## 3. Run Locally (Development)

The repo ships launchers at the root — they expect the prerequisites above:

```bash
./api_start.sh   # FastAPI backend  → http://localhost:8000
./web_start.sh   # Next.js frontend → http://localhost:3000
```

<details>
<summary>Manual, step-by-step</summary>

**Backend:**

```bash
cd apps/fastapi-backend
uv sync                       # install dependencies into .venv
uv run fastapi dev src/fastapi_backend/main.py
```

The API serves on `http://localhost:8000` (`GET /health` for the readiness probe). It starts cleanly even if MongoDB is offline — DB-dependent routes return `503` until it connects.

**Frontend:**

```bash
cd apps/next-frontend
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The frontend proxies `/api/*` to the backend for same-origin cookies.

**Tests:**

```bash
cd apps/fastapi-backend && uv run pytest -v     # backend (pytest + mongomock-motor)
cd apps/next-frontend && pnpm test             # frontend (vitest)
cd apps/next-frontend && pnpm lint              # eslint
```

**Worker daemons (optional, event pipeline):**

```bash
cd apps/hybrid_outbox_streamer && go build ./...   # outbox → Kafka publisher
cd apps/search-indexer && go build ./...           # Kafka → OpenSearch indexer
```

Each daemon reads its own env (Kafka bootstrap/credentials, MongoDB URL, OpenSearch URL) — see `DOCS/ARCHITECTURE.md` §6.

</details>

---

## 4. Run the Backend via Docker

A prebuilt backend image is published on Docker Hub: [`gaurav0s/jam-note-fastapi`](https://hub.docker.com/r/gaurav0s/jam-note-fastapi).

```bash
docker pull gaurav0s/jam-note-fastapi:latest

docker run -d \
  --name jam-note-api \
  -p 8000:8000 \
  -e MONGODB_URL="mongodb://host.docker.internal:27017" \
  -e JWT_SECRET="change-me-in-production" \
  gaurav0s/jam-note-fastapi:latest
```

Notes:

- Point `MONGODB_URL` at your reachable MongoDB — use `host.docker.internal` for a MongoDB running on the Docker host (add `--add-host=host.docker.internal:host-gateway` on Linux), or a container-network hostname, or an Atlas `mongodb+srv://` URI.
- Any other backend setting from §2 can be passed the same way (`DATABASE_NAME`, `OPENSEARCH_*`, …) — environment variables take precedence over the image defaults.
- Verify with `GET http://localhost:8000/health`.

Then run the frontend as usual (`pnpm dev` or `pnpm build && pnpm start` from `apps/next-frontend`, with `NEXT_PUBLIC_API_URL=http://localhost:8000`). A full self-contained compose setup is not part of this repo yet — the frontend is run from source.
