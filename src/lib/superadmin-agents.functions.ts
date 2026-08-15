import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * App superadmin updates a user's phone number.
 * Login identity is derived from the phone: username = u<digits>,
 * email = <username>@wificards.local.
 *
 * Handled entirely by the SECURITY DEFINER RPC `superadmin_update_user_phone`,
 * which verifies the caller is a superadmin and updates auth + profiles +
 * historical username snapshots atomically. No service-role key required.
 */
export const superadminUpdateUserPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; phone: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const targetId = data.userId;
    if (!targetId) throw new Error("MISSING_USER_ID");

    const digits = String(data.phone ?? "").replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 20) throw new Error("INVALID_PHONE");

    const { data: result, error } = await (supabase.rpc as any)("superadmin_update_user_phone", {
      _user_id: targetId,
      _phone: digits,
    });
    if (error) throw new Error(error.message);

    return result ?? { ok: true, username: `u${digits}`, phone: digits };
  });
