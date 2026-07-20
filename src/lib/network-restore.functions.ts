import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Restore a previously downloaded backup JSON into the caller's own network.
 * Wipes the current network's data (packages, cards, sales, requests, payments,
 * join requests) and re-inserts rows from the payload, remapping network_id
 * to the caller's network. Profiles and logs are not restored.
 */
export const restoreMyNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payload: any }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = data?.payload;
    if (!payload || typeof payload !== "object") throw new Error("ملف غير صالح");
    if (!payload.network || typeof payload.network !== "object") {
      throw new Error("الملف لا يحتوي بيانات شبكة");
    }

    const { data: network, error: nErr } = await supabase
      .from("networks")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (nErr) throw new Error(nErr.message);
    if (!network) throw new Error("لا توجد شبكة مرتبطة بحسابك");
    const networkId = network.id as string;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // Delete existing data in FK-safe order.
    const { data: existingReqs } = await admin
      .from("card_requests").select("id").eq("network_id", networkId);
    const existingReqIds = (existingReqs ?? []).map((r: any) => r.id);
    if (existingReqIds.length) {
      await admin.from("request_payments").delete().in("request_id", existingReqIds);
    }
    await admin.from("sales").delete().eq("network_id", networkId);
    await admin.from("card_requests").delete().eq("network_id", networkId);
    await admin.from("cards").delete().eq("network_id", networkId);
    await admin.from("packages").delete().eq("network_id", networkId);
    await admin.from("join_requests").delete().eq("network_id", networkId);

    const remap = (rows: any): any[] =>
      Array.isArray(rows) ? rows.map((r) => ({ ...r, network_id: networkId })) : [];

    const stats: Record<string, number> = {};
    async function ins(table: string, rows: any[]) {
      if (!rows.length) { stats[table] = 0; return; }
      const { error } = await admin.from(table).insert(rows);
      if (error) throw new Error(`${table}: ${error.message}`);
      stats[table] = rows.length;
    }

    await ins("packages", remap(payload.packages));
    await ins("cards", remap(payload.cards));
    await ins("card_requests", remap(payload.card_requests));
    await ins("sales", remap(payload.sales));
    await ins("join_requests", remap(payload.join_requests));
    // request_payments has no network_id; keep as-is (request_id links to restored card_requests)
    await ins("request_payments", Array.isArray(payload.request_payments) ? payload.request_payments : []);

    return { network_id: networkId, stats };
  });
