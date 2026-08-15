import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Restore a previously downloaded backup JSON into the caller's own network.
 *
 * All privileged work runs through SECURITY DEFINER RPCs that verify the caller
 * is an admin owning the target network:
 *   - restore_profile_index()  -> current profiles + taken usernames
 *   - restore_wipe_my_network() -> clears the network's existing data
 *   - restore_create_agent()    -> recreates missing agents as inactive accounts
 *   - restore_insert_rows()     -> inserts rows, forcing the caller's network_id
 * No SUPABASE_SERVICE_ROLE_KEY is needed.
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

    const rpc = supabase.rpc as any;

    const { data: index, error: idxErr } = await rpc("restore_profile_index");
    if (idxErr) throw new Error(idxErr.message);
    const netProfiles: any[] = index?.network_profiles ?? [];
    const usedUsernames = new Set<string>(
      (index?.usernames ?? []).map((u: any) => String(u)).filter(Boolean),
    );

    const { data: wiped, error: wipeErr } = await rpc("restore_wipe_my_network");
    if (wipeErr) throw new Error(wipeErr.message);
    const networkId = String(wiped?.network_id ?? "");
    if (!networkId) throw new Error("لا توجد شبكة مرتبطة بحسابك");

    const genId = () =>
      (globalThis.crypto as any)?.randomUUID?.() ??
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

    const cleanPhone = (value: any) => String(value ?? "").replace(/\D/g, "");

    const allowedUserIds = new Set<string>([userId, ...netProfiles.map((p) => String(p.id))]);
    const usernameToId = new Map<string, string>();
    const phoneToId = new Map<string, string>();
    const namePhoneToId = new Map<string, string>();
    for (const p of netProfiles) {
      if (p?.username) usernameToId.set(String(p.username), p.id);
      const phoneKey = cleanPhone(p?.phone);
      if (phoneKey) phoneToId.set(phoneKey, p.id);
      if (p?.full_name && phoneKey)
        namePhoneToId.set(`${String(p.full_name).trim()}::${phoneKey}`, p.id);
    }

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
      const nameKey =
        prof?.full_name && phoneKey ? `${String(prof.full_name).trim()}::${phoneKey}` : "";
      if (nameKey && namePhoneToId.has(nameKey)) return namePhoneToId.get(nameKey) ?? null;
      return null;
    };

    const packagesIn = Array.isArray(payload.packages) ? payload.packages : [];
    const cardsIn = Array.isArray(payload.cards) ? payload.cards : [];
    const reqsIn = Array.isArray(payload.card_requests) ? payload.card_requests : [];
    const salesIn = Array.isArray(payload.sales) ? payload.sales : [];
    const joinReqsIn = Array.isArray(payload.join_requests) ? payload.join_requests : [];
    const paymentsIn = Array.isArray(payload.request_payments) ? payload.request_payments : [];

    const agentRefIds = new Set<string>();
    const addAgentRef = (value: any) => {
      if (value != null) agentRefIds.add(String(value));
    };
    for (const c of cardsIn) {
      addAgentRef(c?.assigned_to);
      addAgentRef(c?.sold_to);
    }
    for (const r of reqsIn) addAgentRef(r?.agent_id);
    for (const s of salesIn) addAgentRef(s?.agent_id);
    for (const r of joinReqsIn) addAgentRef(r?.agent_id);

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
      const { data: createdId, error: createErr } = await rpc("restore_create_agent", {
        _username: username,
        _full_name: prof?.full_name ?? null,
        _phone: prof?.phone ?? null,
      });
      if (createErr) throw new Error(`profiles: ${createErr.message}`);
      if (!createdId) throw new Error("profiles: تعذر إنشاء حساب المندوب من النسخة");

      createdProfiles += 1;
      allowedUserIds.add(String(createdId));
      usernameToId.set(username, String(createdId));
      const phoneKey = cleanPhone(prof?.phone);
      if (phoneKey) phoneToId.set(phoneKey, String(createdId));
      if (prof?.full_name && phoneKey)
        namePhoneToId.set(`${String(prof.full_name).trim()}::${phoneKey}`, String(createdId));
      oldIdToProfile.set(oldId, { ...prof, id: createdId, username });
    }

    const remapUserId = (oldId: any): string | null => findExistingProfileId(oldId);

    const scrubUserRefs = (rows: any[], fields: string[]): any[] =>
      rows.map((r) => {
        const out = { ...r };
        for (const f of fields) {
          if (out[f] != null) out[f] = remapUserId(out[f]);
        }
        return out;
      });

    const stats: Record<string, number> = { profiles: createdProfiles };
    async function ins(table: string, rows: any[]) {
      if (!rows.length) {
        stats[table] = 0;
        return;
      }
      const { error } = await rpc("restore_insert_rows", { _table: table, _rows: rows });
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
      ...p,
      id: pkgMap.get(p.id) ?? genId(),
      network_id: networkId,
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
