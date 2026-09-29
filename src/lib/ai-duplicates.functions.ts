import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Cust = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  phone: z.string().max(40),
  agentId: z.string().uuid(),
  agentName: z.string().max(200),
  balance: z.number(),
});
const Input = z.object({
  groups: z.array(z.object({ key: z.string().max(100), customers: z.array(Cust).min(2).max(10) })).min(1).max(40),
});

export const reviewDuplicateCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("FORBIDDEN");

    const prompt = `أنت مساعد لمدير شبكة إنترنت. أمامك مجموعات حسابات زبائن مرشحة لأنها قد تخص الشخص نفسه (أرقام مكررة أو أسماء متشابهة).
لكل مجموعة قرر هل هي نفس الزبون، وحدد الحساب الذي يُبقى عليه (الأفضل: الذي لديه رقم صحيح ورصيد/نشاط أكبر)، ووضح أسباب المطابقة باختصار بالعربية.
المجموعات: ${JSON.stringify(data.groups)}
أعد JSON فقط: {"results":[{"key":"<key>","same":true|false,"confidence":0-100,"keepId":"<id من المجموعة>","reasons":["سبب قصير", "..."]}]}`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI_NOT_CONFIGURED");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", input: prompt, stream: true, store: false, reasoning: { effort: "low" } }),
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
    let parsed: any = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch {
      /* ignore */
    }
    const byKey = new Map<string, any>((parsed.results ?? []).map((r: any) => [String(r.key), r]));
    return data.groups.map((g) => {
      const r = byKey.get(g.key) ?? {};
      const keep = g.customers.find((c) => c.id === r.keepId) ?? g.customers[0];
      return {
        key: g.key,
        same: r.same !== false,
        confidence: Math.max(0, Math.min(100, Number(r.confidence ?? 60))),
        keepId: keep.id,
        reasons: Array.isArray(r.reasons) && r.reasons.length ? r.reasons.slice(0, 4).map(String) : ["نفس رقم الواتساب"],
      };
    });
  });
