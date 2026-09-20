import { RecentNotes } from "@/components/recent-notes";

// The shell layout (user, sidebar tree) is fetched server-side in
// app/(app)/layout.tsx; the recent list is a client component reading the
// notes context so it stays live as notes are created or deleted.
// The desk's dark print plate fills the stage: the FIG. 00 empty-
// workspace plate when nothing is filed, the recent-transmissions
// index rows otherwise.
export default function DashboardPage() {
  return <RecentNotes />;
}
