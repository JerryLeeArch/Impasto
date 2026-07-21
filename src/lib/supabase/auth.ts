import { createClient } from "./server";

// getClaims() verifies the JWT locally (the project signs with ES256). getUser()
// costs an auth-server round trip; getSession() skips verification entirely.
export async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  const userId = data?.claims?.sub;
  if (error || !userId) {
    return null;
  }

  return { supabase, user: { id: userId } };
}
