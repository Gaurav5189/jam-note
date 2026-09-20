import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { Archivo, Newsreader, Space_Mono } from "next/font/google";
import { ApiError, serverFetchApi } from "@/lib/server-api";
import { NotesProvider } from "@/context/notes-context";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { SearchPalette } from "@/components/search-palette";
import { DeskChrome } from "@/components/desk/desk-chrome";
import type { NoteTreeItem, User } from "@/lib/types";
import "./desk.css";

export const metadata: Metadata = {
  title: "Jam Notes",
  description: "Your workspace. Write fast. Think in space.",
};

export const viewport: Viewport = {
  themeColor: "#151310",
};

// Same variable-font setup as the landing + auth monographs. `display:
// "block"` keeps kinetic titles from rising in a fallback font and
// then re-laying-out mid-jump.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "block" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], display: "block" });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "block" });

// Authenticated app shell ("the desk" — dark print plate). The user
// and sidebar tree are fetched server-side so the hierarchy paints with
// zero layout shift (Phase 2 verification checklist).
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
    <div className={`desk ${archivo.variable} ${newsreader.variable} ${spaceMono.variable}`}>
      <DeskChrome />
      {/* The runhead lives inside NotesProvider so its live status
          line ("NN NOTES FILED · OPEN: …") reads the context tree. */}
      <NotesProvider initialTree={tree}>
        <Header user={user} />
        <div className="desk-shell">
          <Sidebar />
          <main className="desk-main">{children}</main>
        </div>
        <SearchPalette />
      </NotesProvider>
    </div>
  );
}
