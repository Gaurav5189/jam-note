import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, serverFetchApi } from "@/lib/server-api";
import { NoteHeader } from "@/components/note-header";
import { NoteLayoutView } from "@/components/note-layout-view";
import type { Note } from "@/lib/types";

interface NotePageProps {
  params: Promise<{ id: string }>;
}

async function fetchNote(id: string): Promise<Note | null> {
  try {
    return await serverFetchApi<Note>(`/api/notes/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const note = await fetchNote(id);
    return {
      title: note ? `${note.title} — Jam Notes` : "Note not found — Jam Notes",
    };
  } catch {
    // Auth failures and outages are handled by the page body (redirect to
    // /login or error rendering) — metadata must not throw on its own.
    return { title: "Jam Notes" };
  }
}

export default async function NotePage({ params }: NotePageProps) {
  const { id } = await params;

  let note: Note | null;
  try {
    note = await fetchNote(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    throw err;
  }

  if (!note) {
    return (
      <div className="nf-wrap">
        <div className="nf-panel">
          <i className="fc tl" /><i className="fc tr" /><i className="fc bl" /><i className="fc br" />
          <p className="fig-cap">FIG. 404 — NOT ON FILE</p>
          <p className="nf-mark">NOTE NOT FOUND</p>
          <p className="nf-copy">
            This note does not exist, or belongs to another workspace.
          </p>
          <Link href="/dashboard" className="nf-cta">
            BACK TO WORKSPACE
          </Link>
        </div>
      </div>
    );
  }

  // Parent back-link (one level up). Reparenting keeps parents alive, so a
  // 404 here only happens if the parent was removed outside the API —
  // tolerate it gracefully.
  let parent: Note | null = null;
  if (note.parent_id !== null) {
    parent = await fetchNote(note.parent_id);
  }

  return (
    <div className="note-view">
      <div className="note-head">
        {parent && (
          <Link href={`/notes/${parent.id}`} prefetch={true} className="parent-link rv" style={{ ["--rd" as string]: "0s" }}>
            <ArrowLeft size={11} />
            {parent.title}
          </Link>
        )}
        <NoteHeader noteId={note.id} title={note.title} />
      </div>

      <NoteLayoutView note={note} />
    </div>
  );
}
