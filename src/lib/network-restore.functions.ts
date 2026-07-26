import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Restore a previously downloaded backup JSON into the caller's own network.
 * Wipes the current network's data (packages, cards, sales, requests, payments,
 * join requests) and re-inserts rows from the payload, remapping network_id
 * to the caller's network. Agent profiles referenced by restored records are
 * matched by username/phone, or recreated as inactive agents for this network.
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

    const genId = () =>
      (globalThis.crypto as any)?.randomUUID?.() ??
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

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
      .from("profiles").select("id, username, full_name, phone").eq("network_id", networkId);
    const allowedUserIds = new Set<string>(
      [userId, ...((netProfiles ?? []).map((p: any) => p.id as string))],
    );
    const cleanPhone = (value: any) => String(value ?? "").replace(/\D/g, "");

    // Current profile lookup, for remapping old agent IDs from backup.
    const usernameToId = new Map<string, string>();
    const phoneToId = new Map<string, string>();
    const namePhoneToId = new Map<string, string>();
    for (const p of (netProfiles ?? [])) {
      if (p?.username) usernameToId.set(String(p.username), p.id);
      const phoneKey = cleanPhone(p?.phone);
      if (phoneKey) phoneToId.set(phoneKey, p.id);
      if (p?.full_name && phoneKey) namePhoneToId.set(`${String(p.full_name).trim()}::${phoneKey}`, p.id);
    }

    // old profile id -> backup profile, so restored cards/sales can remain tied
    // to the original agent even when the agent account was not yet in this network.
    const oldIdToProfile = new Map<string, any>();
    const backupProfiles = Array.isArray(payload.profiles) ? payload.profiles : [];
    for (const p of backupProfiles) {
      if (p?.id) oldIdToProfile.set(String(p.id), p);
    }

    const findExistingProfileId = (oldId: any): string | null => {
      if (oldId == null) return null;
      const oldKey = String(oldId);
      if (allowedUserIds.has(oldKey)) return oldKey;
      const prof = oldIdToProfile.get(oldKey);
      if (!prof) return null;
      const username = prof?.username ? String(prof.username) : "";
      if (username && usernameToId.has(username)) return usernameToId.get(username) ?? null;
      const phoneKey = cleanPhone(prof?.phone);
      if (phoneKey && phoneToId.has(phoneKey)) return phoneToId.get(phoneKey) ?? null;
      const nameKey = prof?.full_name && phoneKey ? `${String(prof.full_name).trim()}::${phoneKey}` : "";
      if (nameKey && namePhoneToId.has(nameKey)) return namePhoneToId.get(nameKey) ?? null;
      return null;
    };

    const agentRefIds = new Set<string>();
    const addAgentRef = (value: any) => { if (value != null) agentRefIds.add(String(value)); };
    const packagesIn = Array.isArray(payload.packages) ? payload.packages : [];
    const cardsIn = Array.isArray(payload.cards) ? payload.cards : [];
    const reqsIn = Array.isArray(payload.card_requests) ? payload.card_requests : [];
    const salesIn = Array.isArray(payload.sales) ? payload.sales : [];
    const joinReqsIn = Array.isArray(payload.join_requests) ? payload.join_requests : [];
    const paymentsIn = Array.isArray(payload.request_payments) ? payload.request_payments : [];
    for (const c of cardsIn) { addAgentRef(c?.assigned_to); addAgentRef(c?.sold_to); }
    for (const r of reqsIn) addAgentRef(r?.agent_id);
    for (const s of salesIn) addAgentRef(s?.agent_id);
    for (const r of joinReqsIn) addAgentRef(r?.agent_id);

    const { data: allProfiles } = await admin.from("profiles").select("username");
    const usedUsernames = new Set<string>((allProfiles ?? []).map((p: any) => String(p.username)).filter(Boolean));
    const makeBaseUsername = (profile: any, oldId: string) => {
      const raw = String(profile?.username ?? "").trim();
      const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "");
      if (safe.length >= 3) return safe.slice(0, 24);
      const phoneKey = cleanPhone(profile?.phone);
      if (phoneKey) return `u${phoneKey}`.slice(0, 24);
      return `agent_${oldId.replace(/-/g, "").slice(0, 12)}`;
    };
    const uniqueUsername = (base: string) => {
      let candidate = base;
      let i = 1;
      while (usedUsernames.has(candidate)) {
        candidate = `${base.slice(0, 20)}_${i}`;
        i += 1;
      }
      usedUsernames.add(candidate);
      return candidate;
    };

    let createdProfiles = 0;
    for (const oldId of Array.from(agentRefIds)) {
      if (findExistingProfileId(oldId)) continue;
      const prof = oldIdToProfile.get(oldId);
      if (!prof) continue;
      const username = uniqueUsername(makeBaseUsername(prof, oldId));
      const password = `${genId()}${genId()}`;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: `${username}@karati.local`,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: prof?.full_name ?? null,
          phone: prof?.phone ?? null,
          account_type: "agent",
          network_name: network.name,
        },
      });
      if (createErr) throw new Error(`profiles: ${createErr.message}`);
      const createdId = created?.user?.id;
      if (!createdId) throw new Error("profiles: تعذر إنشاء حساب المندوب من النسخة");
      const { error: profileErr } = await admin.from("profiles").update({
        username,
        full_name: prof?.full_name ?? null,
        phone: prof?.phone ?? null,
        network_id: networkId,
        is_active: false,
      }).eq("id", createdId);
      if (profileErr) throw new Error(`profiles: ${profileErr.message}`);
      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert({ user_id: createdId, role: "agent" }, { onConflict: "user_id,role" });
      if (roleErr) throw new Error(`user_roles: ${roleErr.message}`);
      await admin.from("join_requests").delete().eq("network_id", networkId).eq("agent_id", createdId);
      createdProfiles += 1;
      allowedUserIds.add(createdId);
      usernameToId.set(username, createdId);
      const phoneKey = cleanPhone(prof?.phone);
      if (phoneKey) phoneToId.set(phoneKey, createdId);
      if (prof?.full_name && phoneKey) namePhoneToId.set(`${String(prof.full_name).trim()}::${phoneKey}`, createdId);
      oldIdToProfile.set(oldId, { ...prof, id: createdId, username });
    }

    const remapUserId = (oldId: any): string | null => {
      if (oldId == null) return null;
      return findExistingProfileId(oldId);
    };

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
    stats.profiles = createdProfiles;
    async function ins(table: string, rows: any[]) {
      if (!rows.length) { stats[table] = 0; return; }
      const { error } = await admin.from(table).insert(rows);
      if (error) throw new Error(`${table}: ${error.message}`);
      stats[table] = rows.length;
    }

    // Build ID remaps to avoid PK collisions with rows in other networks.
    const pkgMap = new Map<string, string>();
    const cardMap = new Map<string, string>();
    const reqMap = new Map<string, string>();

    for (const p of packagesIn) if (p?.id) pkgMap.set(p.id, genId());
    for (const c of cardsIn) if (c?.id) cardMap.set(c.id, genId());
    for (const r of reqsIn) if (r?.id) reqMap.set(r.id, genId());

    const newPackages = packagesIn.map((p: any) => ({
      ...p, id: pkgMap.get(p.id) ?? genId(), network_id: networkId,
    }));
    await ins("packages", newPackages);
    const validPkgIds = new Set<string>(newPackages.map((p: any) => p.id));

    const newCards = scrubUserRefs(
      cardsIn.map((c: any) => ({
        ...c,
        id: cardMap.get(c.id) ?? genId(),
        network_id: networkId,
        package_id: pkgMap.get(c.package_id) ?? c.package_id,
      })),
      ["assigned_to", "sold_to"],
    ).filter((c: any) => validPkgIds.has(c.package_id));
    await ins("cards", newCards);

    const scrubbedReqs = reqsIn
      .map((r: any) => ({
        ...r,
        id: reqMap.get(r.id) ?? genId(),
        network_id: networkId,
        agent_id: remapUserId(r.agent_id),
        package_id: pkgMap.get(r.package_id) ?? r.package_id,
        decided_by: remapUserId(r.decided_by),
      }))
      .filter((r: any) => r.agent_id != null && validPkgIds.has(r.package_id));
    await ins("card_requests", scrubbedReqs);
    const insertedReqIds = new Set<string>(scrubbedReqs.map((r: any) => r.id));

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
      joinReqsIn
        .map((r: any) => ({
          ...r,
          id: genId(),
          network_id: networkId,
          agent_id: remapUserId(r.agent_id),
          decided_by: remapUserId(r.decided_by),
        }))
        .filter((r: any) => r.agent_id != null),
    );

    const scrubbedPayments = paymentsIn
      .map((r: any) => ({
        ...r,
        id: genId(),
        request_id: reqMap.get(r.request_id) ?? r.request_id,
        recorded_by: remapUserId(r.recorded_by) ?? userId,
      }))
      .filter((r: any) => r.request_id && insertedReqIds.has(r.request_id));
    await ins("request_payments", scrubbedPayments);

    return { network_id: networkId, stats };
  });

