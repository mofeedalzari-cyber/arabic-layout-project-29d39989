import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { qatibiPayAndReveal } from "@/lib/qatibi.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { Phone, QrCode, DollarSign, ChevronLeft, Copy, CheckCircle2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/app/topup")({
  validateSearch: z.object({ order: z.string().optional() }),
  component: TopupPage,
});

interface OrderRow {
  id: string;
  package_name: string;
  network_name: string;
  price: number;
  status: string;
  card_username: string | null;
  card_password: string | null;
}

function TopupPage() {
  const { order: orderId } = Route.useSearch();
  const navigate = useNavigate();
  const pay = useServerFn(qatibiPayAndReveal);

  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<{ username: string; password: string | null } | null>(null);

  const { data: order, refetch } = useQuery({
    queryKey: ["user-order", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_orders")
        .select("id, package_name, network_name, price, status, card_username, card_password")
        .eq("id", orderId!)
        .maybeSingle();
      if (error) throw error;
      const row = data as OrderRow | null;
      if (row?.status === "PAID" && row.card_username) {
        setCard({ username: row.card_username, password: row.card_password });
      }
      if (row) setAmount(String(Number(row.price)));
      return row;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) return toast.error("لا يوجد طلب");
    const amt = Number(amount);
    if (!/^[0-9]{6,30}$/.test(account.trim())) return toast.error("رقم الحساب غير صحيح");
    if (code.trim().length < 4) return toast.error("كود الشراء غير صحيح");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("المبلغ غير صحيح");
    setBusy(true);
    try {
      const res = await pay({
        data: { orderId, account: account.trim(), code: code.trim(), amount: amt },
      });
      if (!res.ok || !res.card) {
        toast.error(res.error ?? "فشل الدفع");
        return;
      }
      setCard({ username: res.card.username, password: res.card.password });
      toast.success("تم الدفع بنجاح، هذا كرتك");
      void refetch();
    } catch (err) {
      console.error(err);
      toast.error("تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  function copy(v: string) {
    navigator.clipboard?.writeText(v);
    toast.success("تم النسخ");
  }

  return (
    <div dir="rtl" className="space-y-4 pb-8">
      {/* Header */}
      <div className="rounded-3xl bg-[#c6dd00] text-black px-4 py-4 flex items-center justify-between shadow-md">
        <ChevronLeft
          className="h-7 w-7 cursor-pointer"
          onClick={() => navigate({ to: "/app/store" })}
        />
        <h1 className="text-2xl font-extrabold">تغذية الحساب</h1>
      </div>

      {order && (
        <div className="rounded-2xl bg-muted p-4 text-right">
          <div className="font-bold">{order.package_name}</div>
          <div className="text-sm text-muted-foreground">{order.network_name}</div>
          <div className="mt-1 font-extrabold text-lg">{fmtMoney(Number(order.price))}</div>
        </div>
      )}

      {card ? (
        <div className="rounded-3xl bg-[#c6dd00] p-5 text-black space-y-3 shadow-md">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xl font-extrabold">تم الشراء بنجاح</span>
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <Field label="اسم المستخدم (رقم الكرت)">
            <div className="flex items-center gap-2">
              <Copy className="h-5 w-5 cursor-pointer" onClick={() => copy(card.username)} />
              <span className="flex-1 text-lg font-bold tracking-wider text-right">
                {card.username}
              </span>
            </div>
          </Field>
          {card.password && (
            <Field label="كلمة المرور">
              <div className="flex items-center gap-2">
                <Copy className="h-5 w-5 cursor-pointer" onClick={() => copy(card.password!)} />
                <span className="flex-1 text-lg font-bold tracking-wider text-right">
                  {card.password}
                </span>
              </div>
            </Field>
          )}
          <Button
            className="w-full h-12 rounded-2xl bg-black/10 hover:bg-black/20 text-black font-bold"
            onClick={() => navigate({ to: "/app/store" })}
          >
            رجوع للمتجر
          </Button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="rounded-3xl bg-[#c6dd00] p-5 text-black space-y-4 shadow-md"
        >
          <h2 className="text-2xl font-extrabold text-right">بنك القطيبي (ريال جديد)</h2>

          <Field label="رقم الحساب">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              <Input
                inputMode="numeric"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-12 border-0 bg-transparent text-right text-lg font-bold focus-visible:ring-0"
                placeholder="رقم الحساب"
              />
            </div>
          </Field>

          <Field label="كود الشراء">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              <Input
                type={showCode ? "text" : "password"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-12 border-0 bg-transparent text-right text-lg font-bold focus-visible:ring-0"
                placeholder="كود الشراء"
              />
              <button type="button" onClick={() => setShowCode((v) => !v)}>
                {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </Field>

          <Field label="المبلغ">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 border-0 bg-transparent text-right text-lg font-bold focus-visible:ring-0"
                placeholder="المبلغ"
              />
            </div>
          </Field>

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-14 rounded-2xl bg-black/10 hover:bg-black/20 text-black text-lg font-bold"
          >
            {busy ? "جارٍ التحقق…" : "تأكيد الدفع وإظهار الكرت"}
          </Button>

          <p className="text-xs text-black/70 text-center">
            لن يظهر رقم الكرت إلا بعد نجاح عملية الشراء من بنك القطيبي.
          </p>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl bg-[#e8f6f2] px-3 pt-3 pb-1 border border-black/20">
      <span className="absolute -top-2.5 right-4 bg-[#c6dd00] px-2 text-xs font-bold">{label}</span>
      {children}
    </div>
  );
}
