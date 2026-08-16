import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Full backup of the admin's own network as a JSON payload.
 * Uses the caller's authenticated Supabase client, so RLS ensures
 * the admin can only export data belonging to their network.
 */
export const backupMyNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: network, error: nErr } = await supabase
      .from("networks")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (nErr) throw new Error(nErr.message);
    if (!network) throw new Error("لا توجد شبكة مرتبطة بحسابك");

    const networkId = network.id as string;

    const tables = [
      "packages",
      "cards",
      "sales",
      "card_requests",
      "request_payments",
      "join_requests",
      "logs",
      "profiles",
      "customers",
      "customer_payments",
      "mikrotiks",
    ] as const;


    const result: Record<string, any> = {
      exported_at: new Date().toISOString(),
      network,
    };

    for (const t of tables) {
      if (t === "request_payments") {
        // request_payments has no network_id; fetch by request ids
        const { data: reqs } = await supabase
          .from("card_requests")
          .select("id")
          .eq("network_id", networkId);
        const ids = (reqs ?? []).map((r: any) => r.id);
        if (ids.length) {
          const { data, error } = await supabase
            .from("request_payments")
            .select("*")
            .in("request_id", ids);
          if (error) throw new Error(`${t}: ${error.message}`);
          result[t] = data ?? [];
        } else {
          result[t] = [];
        }
        continue;
      }
      if (t === "customer_payments") {
        // may have a null network_id on older rows; fetch by customer ids
        const ids = ((result["customers"] as any[]) ?? []).map((c: any) => c.id);
        if (ids.length) {
          const { data, error } = await supabase
            .from("customer_payments")
            .select("*")
            .in("customer_id", ids);
          if (error) throw new Error(`${t}: ${error.message}`);
          result[t] = data ?? [];
        } else {
          result[t] = [];
        }
        continue;
      }
      if (t === "logs") {
        // logs has no network_id column; skip or fetch actor-based? keep empty
        result[t] = [];
        continue;
      }
      if (t === "cards") {
        // cards.password is column-revoked for direct SELECT; use the admin RPC
        const { data, error } = await (supabase.rpc as any)("admin_list_cards", {
          _network_id: networkId,
          _limit: 1000000,
        });
        if (error) throw new Error(`${t}: ${error.message}`);
        result[t] = (data ?? []).map((c: any) => ({
          id: c.id,
          package_id: c.package_id,
          network_id: networkId,
          username: c.username,
          password: c.password,
          status: c.status,
          sold_to: c.sold_to,
          sold_at: c.sold_at,
          assigned_to: c.assigned_to,
          assigned_at: c.assigned_at,
          created_at: c.created_at,
        }));
        continue;
      }

      const { data, error } = await (supabase as any)
        .from(t)
        .select("*")
        .eq("network_id", networkId);
      if (error) throw new Error(`${t}: ${error.message}`);
      result[t] = data ?? [];
    }

    return result;
  });
