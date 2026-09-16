# Codebase Rules & Development Standards — jam-note

This document establishes absolute code quality standards, naming conventions, architectural boundaries, and linting/verification workflows that any developer (or agent) working on this codebase must strictly follow.

---

## 1. General Principles

1. **Be Opinionated & Clean:** Follow the style of the surrounding codebase. Avoid adding dependencies unless explicitly justified.
2. **Explicit is Better than Implicit:** Keep imports clean, document edge cases in comments, and do not use vague naming.
3. **Never Lose User Data:** Database operations must be safe, wrapped in transactional validations when updating critical relations (like note parent-child pointers), and utilize strict owner boundaries (`user_id`).

---

## 2. Next.js & React Guidelines (Frontend)

1. **Next.js Version Constraints (16.3+):**
   - Read and adapt to the breaking changes mentioned in `AGENTS.md`.
   - Prefer modern patterns: server-first layouts, with client components reserved exclusively for highly interactive interfaces (like the editor canvas and command palette).
2. **Partial Prefetching (PPR) & Cache Components:**
   - Follow instructions in the Next-dev-loop, Cache Components, and PPR Adoption skills.
   - Separate loading state with explicit `<Suspense>` components. Prerender static layout grids (headers, sidebars) while loading blocks and editor widgets dynamically.
3. **Frontend Design Rules (Neo-Industrial Theme):**
   - Backgrounds: Use the custom off-black (`#0D0E11` / `#14161C`) combined with dark graphite steel surfaces (`#1D2027`).
   - Accents: Use electric neon yellow/green (`#D1FF4D`) and cyber-amber (`#FFB800`) sparingly. No large gradient background washes.
   - Borders: Use solid lines (`1px solid #2A2F3D`) instead of drop-shadows.
   - Text Width: Cap body text readability width to exactly **75-80 characters** (`max-w-[75ch]`).
   - Rounding: Avoid bloated pill-shapes. Corner radii should be tight (`rounded-sm` / `rounded-md`).

---

## 3. FastAPI Guidelines (Backend)

1. **Use `Annotated` Dependency Injection:**
   - Always prefer the `Annotated` style for path, query, body parameters, and dependencies.
   - Define custom type aliases for shared dependencies (e.g., `CurrentUserDep = Annotated[User, Depends(get_current_user)]`).
2. **Do Not Use Ellipsis (`...`):**
   - Do not use `...` as a default value for required fields in Pydantic models or path operations.
3. **No Pydantic RootModel:**
   - Do not use Pydantic `RootModel`. Instead, use standard type annotations (like `list[int]`) combined with `Annotated` validation utilities.
4. **Return Types Over response_model:**
   - Provide explicit return types on all router operations. Use `response_model` only when the public model strictly differs from the internal function's returned model.
5. **Sync vs Async Paths:**
   - Use `async def` only when database/API operations are fully asynchronous. For synchronous, blocking tasks, use standard `def` to avoid blocking the event loop.

---

## 4. Database & MongoDB Standards

1. **Enforce Logical Multi-tenancy:**
   - Every database query returning or writing notes MUST append or filter by `user_id` context. No exceptions.
2. **Indexing:**
   - Ensure the following indices are configured in MongoDB:
     * `users.email` (Unique)
     * `notes.user_id` (Standard index for lightning-fast sidebar listing)
     * `notes.parent_id` (Standard index for tree hierarchy parsing)
     * `notes.published_metadata.slug` (Unique, sparse index)
3. **Data Integrity:**
   - When deleting a note, recursively update or handle children to prevent dangling tree pointer bugs.

---

## 5. Development loop & Verification

Before finalizing any feature changes, complete the following steps:
1. **Compilation Issues:** Check using dev tools or run Next.js compilation loops.
2. **API Verification:** Run FastAPI's native tests or hit the endpoints via Swagger UI `/docs` to confirm correct response structures.
3. **Runtime Assertions:** Check the running UI state in the browser. Assert that changes work perfectly under simulated user scenarios, checking components, console errors, and page performance.
