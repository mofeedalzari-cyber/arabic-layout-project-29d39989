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

    const [customers, sales, requests, cards, custPayments] = await Promise.all([
      supabase.from("customers").select("*").eq("agent_id", userId),
      supabase.from("sales").select("*").eq("agent_id", userId),
      supabase.from("card_requests").select("*").eq("agent_id", userId),
      supabase
        .from("cards")
        .select("*")
        .or(`assigned_to.eq.${userId},sold_to.eq.${userId}`),
      supabase.from("customer_payments").select("*").eq("agent_id", userId),
    ]);

    const errs = [customers.error, sales.error, requests.error, cards.error, custPayments.error].filter(Boolean);
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
      customer_payments: custPayments.data ?? [],
    };
  });


/**
 * Restore the agent's own data from a backup file.
 * - customers: upsert by whatsapp (per-agent)
 * - card_requests: recreate PENDING requests for still-existing packages (agents can only insert PENDING via RLS)
 * Sales & cards are network-owned inventory and cannot be re-inserted by an agent (RLS denies it);
 * they are re-created automatically by the admin when they approve requests and by the sell flow.
 */
export const restoreMyAgentData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payload: any }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = data.payload;
    if (!payload || typeof payload !== "object") throw new Error("ملف غير صالح");

    // Agent's network + username
    const { data: profile } = await supabase
      .from("profiles")
      .select("network_id, username")
      .eq("id", userId)
      .maybeSingle();
    const networkId = profile?.network_id ?? null;
    const agentUsername = profile?.username ?? "";

    let customersRestored = 0;
    let customersSkipped = 0;
    let requestsRestored = 0;
    let requestsSkipped = 0;
    let paymentsRestored = 0;
    let paymentsSkipped = 0;
    const notes: string[] = [];

    // Build a map from old customer id -> whatsapp for later payment remap
    const backupCustomers = Array.isArray(payload.customers) ? payload.customers : [];
    const oldCustomerIdToWhatsapp = new Map<string, string>();
    for (const c of backupCustomers) {
      if (c?.id && c?.whatsapp) oldCustomerIdToWhatsapp.set(String(c.id), String(c.whatsapp).trim());
    }

    // 1) Customers — insert new only (dedupe by whatsapp per agent)
    if (backupCustomers.length) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id, whatsapp")
        .eq("agent_id", userId);
      const existingSet = new Set((existing ?? []).map((c: any) => String(c.whatsapp || "").trim()));

      const toInsert = backupCustomers
        .filter((c: any) => c?.whatsapp && !existingSet.has(String(c.whatsapp).trim()))
        .map((c: any) => ({
          agent_id: userId,
          network_id: networkId,
          name: String(c.name ?? "").trim() || "زبون",
          whatsapp: String(c.whatsapp).trim(),
        }));

      customersSkipped = backupCustomers.length - toInsert.length;
      if (toInsert.length) {
        const { error, count } = await supabase
          .from("customers")
          .insert(toInsert, { count: "exact" });
        if (error) throw new Error(`فشل استعادة الزبائن: ${error.message}`);
        customersRestored = count ?? toInsert.length;
      }
    }

    // 2) Card requests — recreate as PENDING for packages still in the agent's network
    const requests = Array.isArray(payload.card_requests) ? payload.card_requests : [];
    if (requests.length && networkId) {
      const pkgIds = Array.from(new Set(requests.map((r: any) => r.package_id).filter(Boolean))) as string[];
      const { data: pkgs } = await supabase
        .from("packages")
        .select("id, name, price, network_id")
        .in("id", pkgIds);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p]));

      const toInsertReq = requests
        .map((r: any) => {
          const pkg = pkgMap.get(r.package_id);
          if (!pkg || pkg.network_id !== networkId) return null;
          const qty = Number(r.quantity);
          if (!Number.isFinite(qty) || qty <= 0) return null;
          const unitPrice = Number(pkg.price) || 0;
          return {
            agent_id: userId,
            agent_username: agentUsername,
            package_id: pkg.id,
            network_id: networkId,
            package_name: pkg.name,
            network_name: r.network_name ?? "",
            quantity: qty,
            status: "PENDING",
            payment_method: (r.payment_method === "CASH" ? "CASH" : "CREDIT"),
            unit_price: unitPrice,
            total_value: unitPrice * qty,
            paid_amount: 0,
            notes: r.notes ?? null,
          };
        })
        .filter(Boolean) as any[];

      requestsSkipped = requests.length - toInsertReq.length;
      if (toInsertReq.length) {
        const { error, count } = await supabase
          .from("card_requests")
          .insert(toInsertReq, { count: "exact" });
        if (error) throw new Error(`فشل استعادة الطلبات: ${error.message}`);
        requestsRestored = count ?? toInsertReq.length;
      }
    } else if (requests.length && !networkId) {
      notes.push("لا يمكن استعادة الطلبات: حسابك غير مرتبط بشبكة.");
    }

    // 3) Customer payments — remap old customer_id -> current customer_id by whatsapp
    const custPayments = Array.isArray(payload.customer_payments) ? payload.customer_payments : [];
    if (custPayments.length) {
      const { data: myCustomers } = await supabase
        .from("customers")
        .select("id, whatsapp")
        .eq("agent_id", userId);
      const waToId = new Map<string, string>();
      for (const c of (myCustomers ?? [])) {
        if (c?.whatsapp) waToId.set(String(c.whatsapp).trim(), c.id);
      }

      const toInsertPay = custPayments
        .map((p: any) => {
          const wa = oldCustomerIdToWhatsapp.get(String(p.customer_id));
          const newCustId = wa ? waToId.get(wa) : null;
          if (!newCustId) return null;
          const amt = Number(p.amount);
          if (!Number.isFinite(amt)) return null;
          return {
            customer_id: newCustId,
            agent_id: userId,
            network_id: networkId,
            amount: amt,
            note: p.note ?? null,
            created_at: p.created_at ?? undefined,
          };
        })
        .filter(Boolean) as any[];

      paymentsSkipped = custPayments.length - toInsertPay.length;
      if (toInsertPay.length) {
        const { error, count } = await supabase
          .from("customer_payments")
          .insert(toInsertPay, { count: "exact" });
        if (error) throw new Error(`فشل استعادة تسديدات الزبائن: ${error.message}`);
        paymentsRestored = count ?? toInsertPay.length;
      }
    }

    const salesCount = Array.isArray(payload.sales) ? payload.sales.length : 0;
    const cardsCount = Array.isArray(payload.cards) ? payload.cards.length : 0;
    if (salesCount || cardsCount) {
      notes.push(
        "لا يمكن استعادة المبيعات والكروت مباشرة (ملكيتها للشبكة). أُعيد إنشاء الطلبات كطلبات جديدة بانتظار موافقة المدير."
      );
    }

    return {
      customers_restored: customersRestored,
      customers_skipped: customersSkipped,
      requests_restored: requestsRestored,
      requests_skipped: requestsSkipped,
      customer_payments_restored: paymentsRestored,
      customer_payments_skipped: paymentsSkipped,
      notes,
    };
  });


