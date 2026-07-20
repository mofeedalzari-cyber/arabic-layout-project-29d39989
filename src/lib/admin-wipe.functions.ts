import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Full database wipe.
 * Uses the SECURITY DEFINER RPC `admin_wipe_database()`, which:
 *  - verifies the caller is an admin
 *  - TRUNCATEs networks/packages/cards/card_requests/sales/logs with CASCADE
 *  - resets identity sequences
 *  - removes non-admin roles/profiles/auth users
 *  - keeps the admin account intact
 *
 * The SERVICE_ROLE key is intentionally not used here.
 */
export const wipeAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase.rpc as any)("admin_wipe_database");
    if (error) throw new Error(error.message);
    return { ok: true, result: data };
  });
