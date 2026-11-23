import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Never treat a resolved PostgREST error or a signed-out no-op as a saved token. */
export async function persistPushToken(
  client: Pick<SupabaseClient<Database>, "auth" | "rpc">,
  token: string,
  platform: string,
): Promise<boolean> {
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error("PUSH_SESSION_FAILED");
  if (!data.session) return false;
  const { error } = await client.rpc("register_device_token", {
    _token: token,
    _platform: platform,
  });
  if (error) throw new Error("PUSH_TOKEN_SAVE_FAILED");
  return true;
}