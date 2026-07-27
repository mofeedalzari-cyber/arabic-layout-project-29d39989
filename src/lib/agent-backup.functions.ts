import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Backup of the agent's own data: profile info, customers, sales history,
 * card requests, and cards currently assigned/sold to them. RLS ensures
 * the agent can only read their own rows.
 */
export const backupMyAgentData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const [customers, sales, requests, cards] = await Promise.all([
      supabase.from("customers").select("*").eq("agent_id", userId),
      supabase.from("sales").select("*").eq("agent_id", userId),
      supabase.from("card_requests").select("*").eq("agent_id", userId),
      supabase
        .from("cards")
        .select("*")
        .or(`assigned_to.eq.${userId},sold_to.eq.${userId}`),
    ]);

    const errs = [customers.error, sales.error, requests.error, cards.error].filter(Boolean);
    if (errs.length) throw new Error(errs.map((e) => e!.message).join(" | "));

    // request_payments recorded by the agent
    const reqIds = (requests.data ?? []).map((r: any) => r.id);
    let payments: any[] = [];
    if (reqIds.length) {
      const { data, error } = await supabase
        .from("request_payments")
        .select("*")
        .in("request_id", reqIds);
      if (error) throw new Error(error.message);
      payments = data ?? [];
    }

    return {
      exported_at: new Date().toISOString(),
      kind: "agent-backup",
      profile,
      customers: customers.data ?? [],
      sales: sales.data ?? [],
      card_requests: requests.data ?? [],
      cards: cards.data ?? [],
      request_payments: payments,
    };
  });

/**
 * Restore the agent's own customers from a backup file.
 * Only customers are restored (upsert by whatsapp) since sales/cards
 * are network-owned and controlled by the admin.
 */
export const restoreMyAgentData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payload: any }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = data.payload;
    if (!payload || typeof payload !== "object") throw new Error("ملف غير صالح");

    const customers = Array.isArray(payload.customers) ? payload.customers : [];
    if (!customers.length) {
      return { customers_restored: 0 };
    }

    // Get agent's network_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("network_id")
      .eq("id", userId)
      .maybeSingle();

    // Existing customers by whatsapp
    const { data: existing } = await supabase
      .from("customers")
      .select("id, whatsapp")
      .eq("agent_id", userId);
    const existingSet = new Set((existing ?? []).map((c: any) => (c.whatsapp || "").trim()));

    const toInsert = customers
      .filter((c: any) => c?.whatsapp && !existingSet.has(String(c.whatsapp).trim()))
      .map((c: any) => ({
        agent_id: userId,
        network_id: profile?.network_id ?? null,
        name: String(c.name ?? "").trim() || "زبون",
        whatsapp: String(c.whatsapp).trim(),
      }));

    let inserted = 0;
    if (toInsert.length) {
      const { error, count } = await supabase
        .from("customers")
        .insert(toInsert, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted = count ?? toInsert.length;
    }

    return { customers_restored: inserted, skipped_duplicates: customers.length - inserted };
  });
