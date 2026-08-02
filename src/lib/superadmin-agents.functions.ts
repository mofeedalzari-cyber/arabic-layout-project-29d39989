import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * App superadmin updates a user's phone number.
 * Login identity is derived from the phone: username = u<digits>,
 * email = <username>@wificards.local — so we update profiles + auth together.
 */
export const superadminUpdateUserPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; phone: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;
    const targetId = data.userId;
    if (!targetId) throw new Error("MISSING_USER_ID");

    const { data: isSuper, error: roleErr } = await (supabase.rpc as any)("is_superadmin", {
      _uid: callerId,
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isSuper) throw new Error("FORBIDDEN");

    const digits = String(data.phone ?? "").replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 20) throw new Error("INVALID_PHONE");

    const newUsername = `u${digits}`.slice(0, 30);
    const newEmail = `${newUsername}@wificards.local`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: taken } = await (supabaseAdmin.from("profiles") as any)
      .select("id")
      .eq("username", newUsername)
      .neq("id", targetId)
      .maybeSingle();
    if (taken) throw new Error("رقم الجوال مستخدم من قبل حساب آخر");

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      email: newEmail,
      email_confirm: true,
    } as any);
    if (authErr) {
      const m = String(authErr.message || "");
      if (/already|registered|exists|duplicate/i.test(m)) {
        throw new Error("رقم الجوال مستخدم من قبل حساب آخر");
      }
      throw new Error(`تعذّر تحديث بيانات الحساب: ${m}`);
    }

    const { error: upErr } = await (supabaseAdmin.from("profiles") as any)
      .update({ phone: digits, username: newUsername })
      .eq("id", targetId);
    if (upErr) throw new Error(`تعذّر حفظ رقم الهاتف: ${upErr.message}`);

    return { ok: true, username: newUsername, phone: digits };
  });
