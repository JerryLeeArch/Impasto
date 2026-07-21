import { redirect } from "next/navigation";
import { listFeed } from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";
import Home from "./home-client";

export const dynamic = "force-dynamic";

// Prefetching the default feed here avoids the hydrate → fetch waterfall.
export default async function HomePage() {
  const auth = await getAuthenticatedClient();

  // The proxy redirects unauthenticated requests; this is a safety net.
  if (!auth) {
    redirect("/login");
  }

  let initialLogs: Awaited<ReturnType<typeof listFeed>> = [];
  try {
    initialLogs = await listFeed(auth.supabase, { scope: "all", search: "" });
  } catch (error) {
    // The client refetches on mount, so a failed prefetch is not fatal.
    console.error(error);
  }

  return <Home initialLogs={initialLogs} />;
}
