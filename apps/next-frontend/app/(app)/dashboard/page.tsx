import { RecentNotes } from "@/components/recent-notes";

// The shell layout (user, sidebar tree) is fetched server-side in
// app/(app)/layout.tsx; the recent list is a client component reading the
// notes context so it stays live as notes are created or deleted.
// Phase 5: the workspace lives at /dashboard — "/" is now the public
// marketing landing page for logged-out visitors.
export default function DashboardPage() {
  return (
    <div className="p-8">
      <RecentNotes />
    </div>
  );
}
