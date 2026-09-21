"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import { findNotePath, flattenNotes } from "@/lib/workspace-tree";
import type { NoteListItem, WorkspaceTree } from "@/lib/types";
import { deskBurst, deskToast } from "@/components/desk/desk-chrome";
import { formatLocalDateTime } from "@/lib/time";

const RECENT_LIMIT = 8;

// UTC slice on the server (deterministic — no hydration drift), then
// the browser's locale/timezone once mounted. The API emits naive UTC
// ISO; lib/time.ts normalizes the parse (see the note header bar).
function formatStamp(iso: string, local: boolean): string {
  return local ? formatLocalDateTime(iso) : `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** Split a word into per-glyph kinetic spans (the letterpress intro). */
function KineticWord({ word, line }: { word: string; line: number }) {
  return (
    <>
      {[...word].map((ch, i) => (
        <b
          key={i}
          className="k"
          style={{ ["--d" as string]: `${0.25 + line * 0.3 + i * 0.045}s` }}
        >
          {ch}
        </b>
      ))}
    </>
  );
}

export function RecentNotes() {
  const { tree, createNote } = useWorkspace();
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Swap UTC slices for local stamps after mount — scheduled callback,
  // never a synchronous setState in the effect body.
  const [local, setLocal] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLocal(true), 0);
    return () => clearTimeout(id);
  }, []);

  const notes = flattenNotes(tree)
    .slice()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, RECENT_LIMIT);

  // Pointer-proximity weight/width field over the kinetic title — the
  // same two-phase system as the landing hero: only after
  // body.intro-done cancels the CSS intro may the rAF loop write
  // inline font-variation-settings (wght stays parked at 900, wdth
  // swells 112→125). Self-clears below .004 so CSS reclaims the rest
  // recipe. Reduced motion: no field.
  useEffect(() => {
    if (notes.length > 0) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const glyphs: { el: HTMLElement; ci: number; set: boolean }[] = [];
    titleRef.current?.querySelectorAll<HTMLElement>(".k").forEach((el) => {
      glyphs.push({ el, ci: 0, set: false });
    });
    if (glyphs.length === 0) return;

    const ptr = { x: -9999, y: -9999 };
    const track = (event: PointerEvent) => {
      ptr.x = event.clientX;
      ptr.y = event.clientY;
    };
    addEventListener("pointermove", track, { passive: true });

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!document.body.classList.contains("intro-done")) return;
      const hr = titleRef.current?.getBoundingClientRect();
      if (!hr || hr.bottom < 60 || hr.top > innerHeight - 60) return;
      for (const L of glyphs) {
        const r = L.el.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - ptr.x, r.top + r.height / 2 - ptr.y);
        let t = Math.max(0, 1 - d / 175);
        t = t * t * (3 - 2 * t); // smoothstep
        const p = L.ci + (t - L.ci) * 0.16;
        if (Math.abs(p) > 0.004 || Math.abs(L.ci) > 0.004) {
          L.ci = p;
          L.set = true;
          L.el.style.fontVariationSettings = `'wght' 900, 'wdth' ${(112 + p * 13).toFixed(1)}`;
        } else if (L.set) {
          L.set = false;
          L.ci = 0;
          L.el.style.fontVariationSettings = "";
        }
      }
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", track);
    };
  }, [notes.length]);

  const handleCreate = async (source?: HTMLElement) => {
    try {
      const note = await createNote({ title: "Untitled" });
      deskToast(`NOTE FILED — ${note.title.toUpperCase()}.`);
      if (source) {
        const rect = source.getBoundingClientRect();
        deskBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, "#ffb511");
      }
      router.push(`/notes/${note.id}`);
    } catch (err) {
      console.error("Note creation failed:", err);
    }
  };

  if (notes.length === 0) {
    return (
      <div className="desk-dash">
        <div className="empty-view">
          <div className="plate-frame">
            <i className="fc tl" /><i className="fc tr" /><i className="fc bl" /><i className="fc br" />
            <p className="fig-cap">FIG. 00 — NOTHING FILED YET</p>
            <h1 className="ev-title" ref={titleRef} aria-label="Empty workspace">
              <span className="ev-line">
                <span className="ht" aria-hidden="true"><KineticWord word="EMPTY" line={0} /></span>
              </span>
              <span className="ev-line outline">
                <span className="ht" aria-hidden="true"><KineticWord word="WORKSPACE" line={1} /></span>
              </span>
            </h1>
            <p className="ev-dek">No notes detected on this channel.</p>
            <button
              type="button"
              className="gold-cta"
              onClick={(e) => handleCreate(e.currentTarget)}
            >
              NEW NOTE
            </button>
            <p className="ev-hint">
              PRESS <kbd>⌘K</kbd> TO SEARCH
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="desk-dash">
      <div className="dash-wrap">
        <div className="dash-head">
          <p className="kicker">RECENT TRANSMISSIONS</p>
          <button
            type="button"
            className="dash-new"
            onClick={(e) => handleCreate(e.currentTarget)}
          >
            <Plus size={12} />
            NEW
          </button>
        </div>

        <ul className="dash-list">
          {notes.map((note, index) => (
            <RecentNoteRow key={note.id} note={note} index={index} tree={tree} local={local} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function RecentNoteRow({
  note,
  index,
  tree,
  local,
}: {
  note: NoteListItem;
  index: number;
  tree: WorkspaceTree;
  /** false until mount — SSR renders the deterministic UTC slice. */
  local: boolean;
}) {
  const path = findNotePath(tree, note.id);
  const parentPath =
    path && path.folders.length > 0
      ? path.folders.map((folder) => folder.name).join(" › ")
      : null;

  return (
    <li>
      <Link
        href={`/notes/${note.id}`}
        prefetch={true}
        className="dash-row"
      >
        <i>{String(index + 1).padStart(2, "0")}</i>
        <span className="dash-main">
          <span className="dash-title">{note.title}</span>
          {parentPath && <span className="dash-sub">{parentPath}</span>}
        </span>
        {note.layout_type === "canvas" && <span className="dash-canvas">CANVAS</span>}
        <span className="dash-stamp">{formatStamp(note.updated_at, local)}</span>
      </Link>
    </li>
  );
}
