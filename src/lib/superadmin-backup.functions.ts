import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * نسخة احتياطية كاملة لشبكة محددة — لمدير التطبيق (superadmin) فقط.
 * تتحقق من الدور عبر عميل المستخدم ثم تستخدم صلاحيات الخدمة للقراءة.
 */
export const superadminBackupNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { networkId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const networkId = String(data.networkId || "");
    if (!networkId) throw new Error("لم يتم تحديد الشبكة");

    const { data: isSuper, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "superadmin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isSuper) throw new Error("غير مصرح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: network, error: nErr } = await supabaseAdmin
      .from("networks")
      .select("*")
      .eq("id", networkId)
      .maybeSingle();
    if (nErr) throw new Error(nErr.message);
    if (!network) throw new Error("الشبكة غير موجودة");

    const byNetwork = async (table: string) => {
      const { data: rows, error } = await (supabaseAdmin as any)
        .from(table)
        .select("*")
        .eq("network_id", networkId);
      if (error) throw new Error(`${table}: ${error.message}`);
      return rows ?? [];
    };

    const [packages, cards, sales, cardRequests, joinRequests, profiles, customers, mikrotiks] =
      await Promise.all([
        byNetwork("packages"),
        byNetwork("cards"),
        byNetwork("sales"),
        byNetwork("card_requests"),
        byNetwork("join_requests"),
        byNetwork("profiles"),
        byNetwork("customers"),
        byNetwork("mikrotiks"),
      ]);

    // request_payments لا يحتوي network_id — نجمعها عبر معرفات الطلبات
    let requestPayments: any[] = [];
    const reqIds = (cardRequests as any[]).map((r) => r.id);
    if (reqIds.length) {
      const { data: rp, error } = await supabaseAdmin
        .from("request_payments")
        .select("*")
        .in("request_id", reqIds);
      if (error) throw new Error(`request_payments: ${error.message}`);
      requestPayments = rp ?? [];
    }

    // customer_payments عبر معرفات الزبائن
    let customerPayments: any[] = [];
    const custIds = (customers as any[]).map((c) => c.id);
    if (custIds.length) {
      const { data: cp, error } = await supabaseAdmin
        .from("customer_payments")
        .select("*")
        .in("customer_id", custIds);
      if (error) throw new Error(`customer_payments: ${error.message}`);
      customerPayments = cp ?? [];
    }

    // أدوار المناديب/المدير
    let userRoles: any[] = [];
    const userIds = (profiles as any[]).map((p) => p.id);
    if (userIds.length) {
      const { data: ur, error } = await supabaseAdmin
        .from("user_roles")
        .select("*")
        .in("user_id", userIds);
      if (error) throw new Error(`user_roles: ${error.message}`);
      userRoles = ur ?? [];
    }

    return {
      exported_at: new Date().toISOString(),
      kind: "superadmin-network-backup",
      network,
      packages,
      cards,
      sales,
      card_requests: cardRequests,
      request_payments: requestPayments,
      join_requests: joinRequests,
      profiles,
      user_roles: userRoles,
      customers,
      customer_payments: customerPayments,
      mikrotiks,
      counts: {
        packages: packages.length,
        cards: cards.length,
        sales: sales.length,
        agents: profiles.length,
        customers: customers.length,
      },
    };
  });
