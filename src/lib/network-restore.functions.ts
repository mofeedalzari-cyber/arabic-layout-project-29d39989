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
  .validator((data: { payload: any }) => data)
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
      .from("profiles").select("id, username").eq("network_id", networkId);
    const allowedUserIds = new Set<string>(
      [userId, ...((netProfiles ?? []).map((p: any) => p.id as string))],
    );
    // username -> current profile id, for remapping old agent IDs from backup
    const usernameToId = new Map<string, string>();
    for (const p of (netProfiles ?? [])) {
      if (p?.username) usernameToId.set(String(p.username), p.id);
    }
    // old profile id -> username from backup
    const oldIdToUsername = new Map<string, string>();
    const backupProfiles = Array.isArray(payload.profiles) ? payload.profiles : [];
    for (const p of backupProfiles) {
      if (p?.id && p?.username) oldIdToUsername.set(String(p.id), String(p.username));
    }
    const remapUserId = (oldId: any): string | null => {
      if (oldId == null) return null;
      if (allowedUserIds.has(oldId)) return oldId;
      const uname = oldIdToUsername.get(String(oldId));
      if (uname && usernameToId.has(uname)) return usernameToId.get(uname)!;
      return null;
    };

    const remap = (rows: any): any[] =>
      Array.isArray(rows) ? rows.map((r) => ({ ...r, network_id: networkId })) : [];

    // Remap user-reference fields to current profile IDs via username;
    // set to null if the referenced user doesn't exist in the current network.
    const scrubUserRefs = (rows: any[], fields: string[]): any[] =>
      rows.map((r) => {
        const out = { ...r };
        for (const f of fields) {
          if (out[f] != null) out[f] = remapUserId(out[f]);
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

    const genId = () =>
      (globalThis.crypto as any)?.randomUUID?.() ??
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

    // Build ID remaps to avoid PK collisions with rows in other networks.
    const pkgMap = new Map<string, string>();
    const cardMap = new Map<string, string>();
    const reqMap = new Map<string, string>();

    const packagesIn = Array.isArray(payload.packages) ? payload.packages : [];
    for (const p of packagesIn) if (p?.id) pkgMap.set(p.id, genId());
    const cardsIn = Array.isArray(payload.cards) ? payload.cards : [];
    for (const c of cardsIn) if (c?.id) cardMap.set(c.id, genId());
    const reqsIn = Array.isArray(payload.card_requests) ? payload.card_requests : [];
    for (const r of reqsIn) if (r?.id) reqMap.set(r.id, genId());

    const newPackages = packagesIn.map((p: any) => ({
      ...p, id: pkgMap.get(p.id)!, network_id: networkId,
    }));
    await ins("packages", newPackages);
    const validPkgIds = new Set<string>(newPackages.map((p: any) => p.id));

    const newCards = scrubUserRefs(
      cardsIn.map((c: any) => ({
        ...c,
        id: cardMap.get(c.id)!,
        network_id: networkId,
        package_id: pkgMap.get(c.package_id) ?? c.package_id,
      })),
      ["assigned_to", "sold_to"],
    ).filter((c: any) => validPkgIds.has(c.package_id));
    await ins("cards", newCards);

    const scrubbedReqs = reqsIn
      .filter((r: any) => r.agent_id == null || allowedUserIds.has(r.agent_id))
      .map((r: any) => ({
        ...r,
        id: reqMap.get(r.id)!,
        network_id: networkId,
        package_id: pkgMap.get(r.package_id) ?? r.package_id,
      }))
      .filter((r: any) => validPkgIds.has(r.package_id));
    await ins("card_requests", scrubbedReqs);
    const insertedReqIds = new Set<string>(scrubbedReqs.map((r: any) => r.id));

    const salesIn = Array.isArray(payload.sales) ? payload.sales : [];
    const newSales = scrubUserRefs(
      salesIn.map((s: any) => ({
        ...s,
        id: genId(),
        network_id: networkId,
        package_id: pkgMap.get(s.package_id) ?? s.package_id,
        card_id: cardMap.get(s.card_id) ?? s.card_id,
      })),
      ["agent_id"],
    ).filter((s: any) => s.agent_id != null && validPkgIds.has(s.package_id));
    await ins("sales", newSales);

    await ins(
      "join_requests",
      (Array.isArray(payload.join_requests) ? payload.join_requests : [])
        .filter((r: any) => r.agent_id == null || allowedUserIds.has(r.agent_id))
        .map((r: any) => ({ ...r, id: genId(), network_id: networkId })),
    );

    const paymentsIn = Array.isArray(payload.request_payments) ? payload.request_payments : [];
    const scrubbedPayments = paymentsIn
      .map((r: any) => ({
        ...r,
        id: genId(),
        request_id: reqMap.get(r.request_id) ?? r.request_id,
        recorded_by:
          r.recorded_by && allowedUserIds.has(r.recorded_by) ? r.recorded_by : userId,
      }))
      .filter((r: any) => r.request_id && insertedReqIds.has(r.request_id));
    await ins("request_payments", scrubbedPayments);

    return { network_id: networkId, stats };
  });

