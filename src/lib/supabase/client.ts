import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./shared";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) {
    const { url, publishableKey } = getSupabaseConfig();
    client = createBrowserClient(url, publishableKey);
  }

  return client;
}
