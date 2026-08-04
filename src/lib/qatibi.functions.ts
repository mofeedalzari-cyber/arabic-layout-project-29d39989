import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  orderId: z.string().uuid(),
  account: z.string().trim().min(6).max(30).regex(/^[0-9]+$/),
  code: z.string().trim().min(4).max(20),
  amount: z.number().positive().max(1000000),
});

export interface TopupResult {
  ok: boolean;
  error?: string;
  card?: {
    username: string;
    password: string | null;
    packageName: string;
    networkName: string;
    price: number;
  };
}

/**
 * تأكيد عملية الدفع عبر بنك القطيبي ثم تسليم الكرت.
 * لا يُسلَّم الكرت إلا بعد نجاح التحقق من البنك.
 */
export const qatibiPayAndReveal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }): Promise<TopupResult> => {
    const apiUrl = process.env["QATIBI_API_URL"];
    const apiKey = process.env["QATIBI_API_KEY"];
    if (!apiUrl || !apiKey) {
      return { ok: false, error: "لم يتم ربط بنك القطيبي بعد. تواصل مع مدير التطبيق." };
    }

    // تحقق أن الطلب يخص المستخدم الحالي وأن المبلغ مطابق لسعر الباقة
    const { data: order, error: oErr } = await context.supabase
      .from("user_orders")
      .select("id, price, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) return { ok: false, error: "تعذر قراءة الطلب" };
    if (!order) return { ok: false, error: "الطلب غير موجود" };
    if (Math.abs(Number(order.price) - data.amount) > 0.009) {
      return { ok: false, error: "المبلغ غير مطابق لسعر الباقة" };
    }

    if (order.status !== "PAID") {
      let bankOk = false;
      let bankRefFromBank: string | null = null;
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            account: data.account,
            code: data.code,
            amount: data.amount,
            reference: data.orderId,
          }),
        });
        const bodyText = await res.text();
        let body: any = null;
        try {
          body = JSON.parse(bodyText);
        } catch {
          /* non-JSON */
        }
        if (!res.ok) {
          console.error(`[qatibi] verify failed [${res.status}]: ${bodyText}`);
          return {
            ok: false,
            error: body?.message ?? body?.error ?? "فشل التحقق من بنك القطيبي",
          };
        }
        bankOk = body?.success === true || body?.status === "success" || body?.ok === true;
        bankRefFromBank = body?.reference ?? body?.transaction_id ?? body?.txn ?? null;
        if (!bankOk) {
          return { ok: false, error: body?.message ?? "بيانات الدفع غير صحيحة" };
        }
      } catch (e) {
        console.error("[qatibi] request error", e);
        return { ok: false, error: "تعذر الاتصال ببنك القطيبي" };
      }
      var bankRef = bankRefFromBank;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.rpc as any)("user_fulfill_order", {
      _order_id: data.orderId,
      _user_id: context.userId,
      _bank_account: data.account,
      _bank_ref: typeof bankRef === "string" ? bankRef : null,
    });
    if (error) {
      console.error("[qatibi] fulfill error", error);
      return {
        ok: false,
        error:
          error.message?.includes("NO_CARDS_AVAILABLE") === true
            ? "لا توجد كروت متاحة حاليًا لهذه الباقة"
            : "تم الدفع لكن تعذر تسليم الكرت. تواصل مع المدير.",
      };
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { ok: false, error: "تعذر تسليم الكرت" };
    return {
      ok: true,
      card: {
        username: row.card_username,
        password: row.card_password ?? null,
        packageName: row.package_name,
        networkName: row.network_name,
        price: Number(row.price),
      },
    };
  });
