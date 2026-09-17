"use client";

import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { User } from "@/lib/types";

export const OPEN_SEARCH_EVENT = "jam:open-search";

export function Header({ user }: { user: User }) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetchApi("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
  };

  return (
    <header className="h-14 border-b border-border-thin bg-background-panel px-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold font-mono text-text-primary tracking-tight">jam-note</h1>
        <span className="text-[10px] font-mono text-accent-neon border border-accent-neon/30 px-2 py-0.5 rounded-sm bg-accent-neon/10 uppercase tracking-widest">
          Phase 2
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={openSearch}
          className="flex items-center gap-2 text-xs font-mono text-text-muted border border-border-thin bg-background-steel rounded-sm px-3 py-2 hover:border-accent-neon hover:text-text-primary transition-colors"
          aria-label="Search notes"
        >
          <Search size={13} />
          <span className="uppercase tracking-wider hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-[10px] text-text-muted border border-border-thin rounded-sm px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>

        <div className="text-right hidden md:block">
          <p className="text-sm text-text-primary font-medium leading-tight">
            {user.profile.display_name || user.username}
          </p>
          <p className="text-[11px] text-text-muted font-mono leading-tight">{user.email}</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-text-muted hover:text-accent-amber border border-border-thin px-3 py-2 rounded-sm hover:border-accent-amber transition-colors"
          aria-label="Log out"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    </header>
  );
}
