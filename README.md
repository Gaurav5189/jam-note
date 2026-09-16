# jam-note 🎹📝

Welcome to **jam-note**, a tactile, ultra-fast, block-based note-taking application designed for developers and creators who find traditional tools (like Notion) too clinical, rigid, or slow. 

With dynamic canvas layout modes, recursive note hierarchies, and integrated self-publishing features, `jam-note` bridges the gap between high-end physical journals, audio synthesizers, and modern documentation wikis.

---

## 🛠️ Tech Stack
* **Frontend:** Next.js (16.3+), React 19, TypeScript, TailwindCSS, pnpm
* **Backend:** FastAPI, Python 3.14, Pydantic v2
* **Database:** MongoDB (using the asynchronous `motor` driver)

---

## 🎨 Design Philosophy (Neo-Industrial / Audio-Rack)
Unlike templated cream-and-terracotta or basic dark-mode products, `jam-note` utilizes a custom visual identity:
* **Backgrounds:** Matte off-black surfaces (`#0D0E11`, `#14161C`) combined with dark graphite steel panels (`#1D2027`).
* **Accents:** Electric neon yellow/green (`#D1FF4D`) and high-impact cyber-amber (`#FFB800`) used with razor-sharp restraint.
* **Typographic Limits:** Fixed line lengths (max 75-80 characters per line) to optimize readability.
* **Structured UI:** Thin solid lines (`1px solid #2A2F3D`) and strict corner radii (`rounded-sm`/`rounded-md`) instead of heavy shadows or pill shapes.

---

## 📂 Project Structure & Blueprints
All blueprints, requirements, and structural rules are located inside the `/DOCS` folder:

1. 📑 **[PRD (Product Requirements)](DOCS/PRD.md)**: Outlines user flows, core features (Block Editor, Spatial Jam Canvas, CRM/Publishing Hub), and non-functional requirements.
2. 📐 **[ARCHITECTURE](DOCS/ARCHITECTURE.md)**: Explains MongoDB schemas, modular FastAPI routes, App Router PPR patterns, and sync mechanics.
3. 🏁 **[IMPLEMENTATION PHASES](DOCS/PHASES.md)**: Provides a step-by-step, 5-phase execution plan to safely build, test, and release `jam-note`.
4. 📏 **[CODEBASE RULES](DOCS/RULES.md)**: Absolute quality rules regarding code standards, Pydantic practices, and visual layout guides.

---

## 🚀 Quick Start (Development)

### 1. Prerequisites
Ensure you have the following installed locally:
- Python 3.14+ (or use `uv`)
- Node.js 20+ and `pnpm`
- MongoDB instance (local or Atlas)

### 2. Run Backend
```bash
cd apps/fastapi-backend
uv pip install -r pyproject.toml
fastapi dev src/fastapi_backend/main.py
```

### 3. Run Frontend
```bash
cd apps/next-frontend
pnpm install
pnpm dev
```
By default, the frontend runs on `http://localhost:3000` and proxies auth and content operations to the backend API.
