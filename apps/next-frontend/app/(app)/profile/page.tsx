import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ApiError, serverFetchApi } from "@/lib/server-api";
import { getServerUser } from "@/lib/server-user";
import { ProfileConsole } from "@/components/profile/profile-console";
import type { TrashItem } from "@/lib/types";
import "./profile.css";

export const metadata: Metadata = {
  title: "Jam Notes — Profile",
};

// The operator console (Phase 7). The (app) shell already fetched the
// user (React cache() dedupes the two calls) and seeds the workspace
// tree into context — the export picker reads it live. The trash list
// is fetched here so the count tag is correct on first paint.
export default async function ProfilePage() {
  let user: Awaited<ReturnType<typeof getServerUser>>;
  let trash: TrashItem[];
  try {
    [user, trash] = await Promise.all([
      getServerUser(),
      serverFetchApi<TrashItem[]>("/api/notes/trash"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    throw err;
  }

  return (
    <div className="profile">
      <ProfileConsole user={user} initialTrash={trash} />
    </div>
  );
}
