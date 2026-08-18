import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** إشعار لمديري الشبكة عند وصول طلب كروت جديد */
export const notifyNewCardRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        networkId: z.string().uuid(),
        agentName: z.string().max(120).optional(),
        packageName: z.string().max(120).optional(),
        quantity: z.number().int().positive().max(100000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { sendFcmToTokens } = await import("./fcm.server");
    const { data: rows, error } = await context.supabase.rpc("network_admin_push_tokens", {
      _network_id: data.networkId,
    });
    if (error) return { sent: 0, failed: 0, skipped: "no-access" };
    const tokens = ((rows as { token: string }[] | null) ?? []).map((r) => r.token);
    const agent = data.agentName || "مندوب";
    return sendFcmToTokens(tokens, {
      title: "طلب سحب جديد",
      body: `${agent} · ${data.packageName || "باقة"} · الكمية: ${data.quantity ?? ""}`,
      path: "/app/requests",
      tag: "card-request",
    });
  });

/** إشعار للمندوب عند قبول/رفض طلبه */
export const notifyRequestDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        status: z.enum(["APPROVED", "REJECTED"]),
        packageName: z.string().max(120).optional(),
        quantity: z.number().int().nonnegative().max(100000).optional(),
        reason: z.string().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { sendFcmToTokens } = await import("./fcm.server");
    const { data: rows, error } = await context.supabase.rpc("agent_push_tokens", {
      _agent_id: data.agentId,
    });
    if (error) return { sent: 0, failed: 0, skipped: "no-access" };
    const tokens = ((rows as { token: string }[] | null) ?? []).map((r) => r.token);
    const approved = data.status === "APPROVED";
    return sendFcmToTokens(tokens, {
      title: approved ? "تم قبول طلبك ✅" : "تم رفض طلبك ❌",
      body: approved
        ? `${data.packageName || "باقة"} · الكمية: ${data.quantity ?? ""}`
        : data.reason
          ? `السبب: ${data.reason}`
          : `${data.packageName || "باقة"} · الكمية: ${data.quantity ?? ""}`,
      path: approved ? "/app/cabin" : "/app/requests",
      tag: "card-request-decision",
    });
  });

/** إشعار لمديري الشبكة عند وصول طلب انضمام مندوب جديد (يُستدعى بعد التسجيل قبل التفعيل) */
export const notifyNewJoinRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        networkName: z.string().min(1).max(120),
        username: z.string().min(1).max(60),
        fullName: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendFcmToTokens } = await import("./fcm.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabaseAdmin
      .from("join_requests")
      .select("id, network_id, agent_full_name, agent_username, status")
      .eq("agent_username", data.username)
      .eq("status", "PENDING")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!req?.network_id) return { sent: 0, failed: 0, skipped: "no-request" };

    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (admins ?? []).map((r) => r.user_id);
    if (adminIds.length === 0) return { sent: 0, failed: 0, skipped: "no-admins" };

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("network_id", req.network_id)
      .in("id", adminIds);
    const targetIds = (profs ?? []).map((p) => p.id);
    if (targetIds.length === 0) return { sent: 0, failed: 0, skipped: "no-admins" };

    const { data: rows } = await supabaseAdmin
      .from("device_tokens")
      .select("token")
      .in("user_id", targetIds);
    const tokens = (rows ?? []).map((r) => r.token);

    const who = data.fullName || req.agent_full_name || req.agent_username || "مندوب";
    return sendFcmToTokens(tokens, {
      title: "طلب انضمام جديد",
      body: `${who} · ${data.networkName}`,
      path: "/app/join-requests",
      tag: "join-request",
    });
  });

/** إشعار للمندوب عند قبول/رفض طلب انضمامه */
export const notifyJoinDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        status: z.enum(["APPROVED", "REJECTED"]),
        reason: z.string().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { sendFcmToTokens } = await import("./fcm.server");
    const { data: rows, error } = await context.supabase.rpc("agent_push_tokens", {
      _agent_id: data.agentId,
    });
    if (error) return { sent: 0, failed: 0, skipped: "no-access" };
    const tokens = ((rows as { token: string }[] | null) ?? []).map((r) => r.token);
    const approved = data.status === "APPROVED";
    return sendFcmToTokens(tokens, {
      title: approved ? "تم قبول انضمامك ✅" : "تم رفض طلب الانضمام ❌",
      body: approved
        ? "تم تفعيل حسابك، يمكنك الآن تسجيل الدخول والبدء بالبيع"
        : data.reason
          ? `السبب: ${data.reason}`
          : "تم رفض طلب انضمامك للشبكة",
      path: approved ? "/app" : "/auth",
      tag: "join-decision",
    });
  });

/** إشعار لمديري الشبكة عند إتمام عملية بيع */
export const notifyNewSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        networkId: z.string().uuid(),
        saleId: z.string().uuid().optional(),
        agentName: z.string().max(120).optional(),
        packageName: z.string().max(120).optional(),
        price: z.number().nonnegative().max(100000000).optional(),
        customerName: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { sendFcmToTokens } = await import("./fcm.server");
    const { data: rows, error } = await context.supabase.rpc("network_admin_push_tokens", {
      _network_id: data.networkId,
    });
    if (error) return { sent: 0, failed: 0, skipped: "no-access" };
    const tokens = ((rows as { token: string }[] | null) ?? []).map((r) => r.token);
    const agent = data.agentName || "مندوب";
    const amount = data.price != null ? `${data.price} ﷼` : "";
    const desc = [data.packageName || "باقة", amount, data.customerName].filter(Boolean).join(" · ");
    return sendFcmToTokens(tokens, {
      title: "عملية بيع جديدة",
      body: `${agent} · ${desc}`,
      path: data.saleId ? `/app/sales?sale=${data.saleId}` : "/app/sales",
      tag: "new-sale",
    });
  });
