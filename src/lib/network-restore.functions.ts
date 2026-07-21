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

    // Fetch valid profile IDs belonging to this network (agents + owner).
    const { data: netProfiles } = await admin
      .from("profiles").select("id").eq("network_id", networkId);
    const allowedUserIds = new Set<string>(
      [userId, ...((netProfiles ?? []).map((p: any) => p.id as string))],
    );

    const remap = (rows: any): any[] =>
      Array.isArray(rows) ? rows.map((r) => ({ ...r, network_id: networkId })) : [];

    // Strip any user-reference field that points outside this network.
    const scrubUserRefs = (rows: any[], fields: string[]): any[] =>
      rows.map((r) => {
        const out = { ...r };
        for (const f of fields) {
          if (out[f] != null && !allowedUserIds.has(out[f])) out[f] = null;
        }
        return out;
      });

    const stats: Record<string, number> = {};
    async function ins(table: string, rows: any[]) {
      if (!rows.length) { stats[table] = 0; return; }
      const { error } = await admin.from(table).insert(rows);
      if (error) throw new Error(`${table}: ${error.message}`);
      stats[table] = rows.length;
    }

    await ins("packages", remap(payload.packages));
    await ins(
      "cards",
      scrubUserRefs(remap(payload.cards), ["assigned_to", "sold_to"]),
    );
    // card_requests.agent_id references profiles; drop rows for foreign agents.
    const scrubbedReqs = remap(payload.card_requests).filter((r: any) =>
      r.agent_id == null || allowedUserIds.has(r.agent_id),
    );
    await ins("card_requests", scrubbedReqs);
    const insertedReqIds = new Set<string>(scrubbedReqs.map((r: any) => r.id).filter(Boolean));

    await ins(
      "sales",
      scrubUserRefs(remap(payload.sales), ["agent_id"]).filter(
        (r: any) => r.agent_id != null,
      ),
    );
    await ins(
      "join_requests",
      remap(payload.join_requests).filter((r: any) =>
        r.agent_id == null || allowedUserIds.has(r.agent_id),
      ),
    );
    // request_payments: only keep rows whose request_id was just re-inserted for this network,
    // and whose recorded_by belongs to this network.
    const paymentsIn = Array.isArray(payload.request_payments) ? payload.request_payments : [];
    const scrubbedPayments = paymentsIn
      .filter((r: any) => r.request_id && insertedReqIds.has(r.request_id))
      .map((r: any) => ({
        ...r,
        recorded_by:
          r.recorded_by && allowedUserIds.has(r.recorded_by) ? r.recorded_by : userId,
      }));
    await ins("request_payments", scrubbedPayments);

    return { network_id: networkId, stats };
  });

