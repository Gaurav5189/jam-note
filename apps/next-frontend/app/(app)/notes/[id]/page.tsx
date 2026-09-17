import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, serverFetchApi } from "@/lib/server-api";
import { BlockEditor } from "@/components/editor/block-editor";
import { NoteHeader } from "@/components/note-header";
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
      title: note ? `${note.title} — jam-note` : "Note not found — jam-note",
    };
  } catch {
    // Auth failures and outages are handled by the page body (redirect to
    // /login or error rendering) — metadata must not throw on its own.
    return { title: "jam-note" };
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
      <div className="p-8">
        <div className="max-w-lg mx-auto mt-16 bg-background-panel border border-border-thin rounded-md p-10 text-center">
          <p className="font-mono text-accent-amber text-sm uppercase tracking-widest">
            404 // Note not found
          </p>
          <p className="mt-3 text-sm text-text-muted">
            This note does not exist, or belongs to another workspace.
          </p>
          <Link
            href="/"
            className="inline-block mt-6 text-xs font-mono uppercase tracking-wider text-text-muted hover:text-accent-neon border border-border-thin hover:border-accent-neon px-4 py-2 rounded-sm transition-colors"
          >
            Back to workspace
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
    <div className="p-8">
      <div className="max-w-[75ch] mx-auto">
        {parent && (
          <Link
            href={`/notes/${parent.id}`}
            prefetch={true}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-accent-neon transition-colors mb-3"
          >
            <ArrowLeft size={12} />
            {parent.title}
          </Link>
        )}

        <NoteHeader noteId={note.id} title={note.title} />

        <div className="flex items-center gap-3 mt-2 px-2 -mx-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted border border-border-thin rounded-sm px-2 py-0.5">
            {note.layout_type}
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            created {note.created_at.slice(0, 10)} · updated {note.updated_at.slice(0, 16).replace("T", " ")} UTC
          </span>
        </div>

        <BlockEditor noteId={note.id} initialBlocks={note.blocks} />
      </div>
    </div>
  );
}
