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
    return sendFcmToTokens(tokens, {
      title: `طلب سحب جديد — ${data.agentName || "مندوب"}`,
      body: `${data.packageName || "باقة"} · الكمية: ${data.quantity ?? ""}`,
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
