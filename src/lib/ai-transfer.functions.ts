import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  customerId: z.string().uuid(),
  reason: z.string().trim().min(2).max(500),
  agents: z.array(z.object({ id: z.string().uuid(), name: z.string().max(200) })).min(1).max(200),
});

export const suggestTransferAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("FORBIDDEN");

    const { data: cust, error: ce } = await supabase
      .from("customers").select("id,name,whatsapp,agent_id,network_id").eq("id", data.customerId).maybeSingle();
    if (ce || !cust) throw new Error("CUSTOMER_NOT_FOUND");

    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const ids = data.agents.map((a) => a.id);
    const [{ data: custs }, { data: sales }, { data: custSales }] = await Promise.all([
      supabase.from("customers").select("agent_id").in("agent_id", ids),
      supabase.from("sales").select("agent_id,price").in("agent_id", ids).gte("sold_at", since).limit(20000),
      supabase.from("sales").select("price,package_name,sold_at").eq("customer_id", cust.id).order("sold_at", { ascending: false }).limit(50),
    ]);

    const stats = data.agents.map((a) => {
      const s = (sales ?? []).filter((x: any) => x.agent_id === a.id);
      return {
        id: a.id,
        name: a.name,
        customers: (custs ?? []).filter((x: any) => x.agent_id === a.id).length,
        sales30d: s.length,
        revenue30d: Math.round(s.reduce((t: number, x: any) => t + Number(x.price || 0), 0)),
      };
    });
    const customer = {
      name: cust.name,
      currentAgent: data.agents.find((a) => a.id === cust.agent_id)?.name ?? "غير معروف",
      purchases: (custSales ?? []).length,
      recentPackages: [...new Set((custSales ?? []).map((x: any) => x.package_name))].slice(0, 5),
    };
    const candidates = stats.filter((s) => s.id !== cust.agent_id);
    if (!candidates.length) throw new Error("NO_CANDIDATES");

    const prompt = `أنت مساعد لمدير شبكة إنترنت. اقترح أنسب مندوب لنقل الزبون إليه.
سبب النقل: ${data.reason}
بيانات الزبون: ${JSON.stringify(customer)}
المندوبون المرشحون (آخر 30 يومًا): ${JSON.stringify(candidates)}
أعد JSON فقط بالشكل: {"agentId":"<id من القائمة>","explanation":"سبب قصير بالعربية لا يتجاوز جملتين"}`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI_NOT_CONFIGURED");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
      }),
    });
    if (res.status === 429) throw new Error("AI_RATE_LIMIT");
    if (res.status === 402) throw new Error("AI_NO_CREDITS");
    if (!res.ok || !res.body) throw new Error("AI_ERROR_" + res.status);

    let text = "";
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        const p = l.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        } catch {
          /* ignore */
        }
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    let out: { agentId?: string; explanation?: string } = {};
    try {
      out = m ? JSON.parse(m[0]) : {};
    } catch {
      /* fallback below */
    }
    const pick = candidates.find((c) => c.id === out.agentId) ??
      [...candidates].sort((a, b) => a.customers - b.customers)[0];
    return {
      agentId: pick.id,
      agentName: pick.name,
      explanation: out.explanation || "تم اختيار المندوب الأقل عبئًا من حيث عدد الزبائن.",
    };
  });
