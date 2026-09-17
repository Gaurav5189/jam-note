import { redirect } from "next/navigation";
import { ApiError, serverFetchApi } from "@/lib/server-api";
import { NotesProvider } from "@/context/notes-context";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { SearchPalette } from "@/components/search-palette";
import type { NoteTreeItem, User } from "@/lib/types";

// Authenticated app shell. The sidebar tree is fetched server-side so the
// hierarchy paints with zero layout shift (Phase 2 verification checklist).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: User;
  let tree: NoteTreeItem[];
  try {
    [user, tree] = await Promise.all([
      serverFetchApi<User>("/api/auth/me"),
      serverFetchApi<NoteTreeItem[]>("/api/notes/trees"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Cookie present but session invalid (proxy.ts only checks presence).
      redirect("/login");
    }
    throw err;
  }

  return (
    <div className="h-screen flex flex-col bg-background-base">
      <Header user={user} />
      <div className="flex flex-1 min-h-0">
        <NotesProvider initialTree={tree}>
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            {children}
          </main>
          <SearchPalette />
        </NotesProvider>
      </div>
    </div>
  );
}
