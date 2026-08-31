import { redirect } from "next/navigation";
import { FEED_PAGE_SIZE, listFeedPage, type FeedPage } from "@/lib/db";
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

  let initialFeedPage: FeedPage | undefined;
  try {
    initialFeedPage = await listFeedPage(auth.supabase, {
      scope: "all",
      search: "",
      limit: FEED_PAGE_SIZE,
    });
  } catch (error) {
    // Leaving initialData undefined lets React Query fetch the first page in
    // the browser, so a transient server-side prefetch failure is not fatal.
    console.error(error);
  }

  return <Home initialFeedPage={initialFeedPage} />;
}
