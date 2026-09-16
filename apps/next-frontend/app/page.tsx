"use client";

import { useAuth } from "@/context/auth-context";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-base text-text-muted font-mono uppercase tracking-widest text-sm">
        Initializing Workspace...
      </div>
    );
  }

  if (!user) {
    return null; // Handled by middleware
  }

  return (
    <div className="min-h-screen bg-background-base flex flex-col">
      <header className="border-b border-border-thin bg-background-panel px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold font-mono text-text-primary">jam-note</h1>
          <span className="text-accent-neon text-xs font-mono border border-accent-neon/30 px-2 py-1 rounded-sm bg-accent-neon/10">
            PHASE 1
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-text-primary font-medium">{user.profile.display_name || user.username}</p>
            <p className="text-xs text-text-muted font-mono">{user.email}</p>
          </div>
          <button 
            onClick={logout}
            className="text-xs font-mono uppercase tracking-wider text-text-muted hover:text-accent-amber transition-colors border border-border-thin px-3 py-2 rounded-sm hover:border-accent-amber"
          >
            Disconnect
          </button>
        </div>
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-background-panel border border-border-thin rounded-md p-8 shadow-sm">
            <h2 className="text-2xl text-text-primary mb-2 font-medium">Workspace Active</h2>
            <p className="text-text-muted text-body mb-6 leading-relaxed">
              Welcome to your personal sandbox. The Neo-Industrial aesthetic is loaded, 
              and the block editor engine is being provisioned for Phase 2.
            </p>

            <div className="grid grid-cols-2 gap-4 font-mono text-sm">
              <div className="p-4 bg-background-steel border border-border-thin rounded-sm">
                <p className="text-text-muted mb-1 uppercase text-xs">Current Theme</p>
                <p className="text-accent-neon">{user.settings.theme}</p>
              </div>
              <div className="p-4 bg-background-steel border border-border-thin rounded-sm">
                <p className="text-text-muted mb-1 uppercase text-xs">Default Layout</p>
                <p className="text-text-primary">{user.settings.editor_preferences.default_layout}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
