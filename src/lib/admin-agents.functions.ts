import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin updates an agent (in the admin's own network):
 *   - full_name / phone on profiles
 *   - password / phone on auth.users
 * Verifies:
 *   - caller is admin (has_role)
 *   - caller owns a network
 *   - target agent belongs to caller's network
 */
export const adminUpdateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      agentId: string;
      full_name?: string | null;
      phone?: string | null;
      password?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const agentId = data.agentId;
    if (!agentId) throw new Error("MISSING_AGENT_ID");

    // Authorize: caller is admin and owns a network
    const { data: isAdmin, error: roleErr } = await (supabase.rpc as any)("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("FORBIDDEN");

    const { data: net, error: netErr } = await supabase
      .from("networks")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (netErr) throw new Error(netErr.message);
    if (!net) throw new Error("NO_NETWORK");

    // Target must be in this network
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, network_id, username")
      .eq("id", agentId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    if (!prof || prof.network_id !== net.id) throw new Error("FORBIDDEN");

    const phone = data.phone == null ? null : String(data.phone).trim();
    const full_name = data.full_name == null ? null : String(data.full_name).trim();
    const password = data.password == null ? null : String(data.password);

    if (phone !== null && phone !== "" && !/^\d{6,20}$/.test(phone.replace(/\D/g, ""))) {
      throw new Error("INVALID_PHONE");
    }
    if (password !== null && password.length > 0 && password.length < 6) {
      throw new Error("PASSWORD_TOO_SHORT");
    }

    // Login identity is derived from the phone: username = u<digits>, email = <username>@wificards.local
    const digits = phone ? phone.replace(/\D/g, "") : "";
    const newUsername = digits ? `u${digits}`.slice(0, 30) : null;
    const newEmail = newUsername ? `${newUsername}@wificards.local` : null;

    // 1) Auth update FIRST (password + login email) so we never leave the profile
    //    out of sync with the login identity. Uses service role.
    //    NOTE: never set auth.phone here; the SMS provider is disabled and it fails.
    const authAttrs: Record<string, unknown> = {};
    if (password && password.length > 0) authAttrs.password = password;
    if (newEmail && newUsername && newUsername !== prof.username) {
      authAttrs.email = newEmail;
      authAttrs.email_confirm = true;
    }

    if (Object.keys(authAttrs).length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Make sure the derived login is not taken by another account
      if (authAttrs.email) {
        const { data: taken } = await (supabaseAdmin.from("profiles") as any)
          .select("id")
          .eq("username", newUsername)
          .neq("id", agentId)
          .maybeSingle();
        if (taken) throw new Error("رقم الجوال مستخدم من قبل حساب آخر");
      }

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        agentId,
        authAttrs as any,
      );
      if (authErr) {
        const m = String(authErr.message || "");
        if (/already|registered|exists|duplicate/i.test(m)) {
          throw new Error("رقم الجوال مستخدم من قبل حساب آخر");
        }
        throw new Error(`تعذّر تحديث بيانات الحساب: ${m}`);
      }
    }

    // 2) Profile update (admin policy allows updating agents in own network)
    const profileUpdate: Record<string, unknown> = {};
    if (data.full_name !== undefined) profileUpdate.full_name = full_name || null;
    if (data.phone !== undefined) profileUpdate.phone = phone || null;
    if (newUsername) profileUpdate.username = newUsername;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: upErr } = await (supabase.from("profiles") as any)
        .update(profileUpdate)
        .eq("id", agentId);
      if (upErr) throw new Error(`تعذّر حفظ بيانات الملف الشخصي: ${upErr.message}`);
    }

    return { ok: true };
  });

/**
 * Admin permanently deletes an agent from their own network:
 *  - verifies caller is admin and owns a network
 *  - verifies target agent belongs to caller's network
 *  - removes agent from network, deletes role/profile rows, deletes auth user
 * Sales/cards history is preserved (agent_id column just becomes an orphan reference).
 */
export const adminDeleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const agentId = data.agentId;
    if (!agentId) throw new Error("MISSING_AGENT_ID");
    if (agentId === userId) throw new Error("CANNOT_DELETE_SELF");

    // Authorize: caller is admin and owns a network
    const { data: isAdmin, error: roleErr } = await (supabase.rpc as any)("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("FORBIDDEN");

    const { data: net, error: netErr } = await supabase
      .from("networks")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (netErr) throw new Error(netErr.message);
    if (!net) throw new Error("NO_NETWORK");

    // Target must be in this network
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, network_id, username")
      .eq("id", agentId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    if (!prof || prof.network_id !== net.id) throw new Error("FORBIDDEN");

    const { data: result, error } = await (supabase.rpc as any)("admin_delete_agent", {
      _agent_id: agentId,
    });
    if (error) throw new Error(error.message);

    return result ?? { ok: true };
  });
