import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { displayPhone, fmtMoney, fmtArabicDateTimePdf } from "@/lib/format";
import { HandCoins, Receipt as ReceiptIcon, Share2 } from "lucide-react";

export const Route = createFileRoute("/app/payments")({ component: PaymentsPage });

function PaymentsPage() {
  const { role, profile } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;

  const qc = useQueryClient();
  const [agentId, setAgentId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const { data: network } = useQuery({
    queryKey: ["pay-network", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase.from("networks").select("id, name, currency").eq("owner_id", profile!.id).maybeSingle();
      return data;
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["pay-agents", network?.id],
    enabled: !!network?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id, username, full_name, phone")
        .eq("network_id", network!.id)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: debt, refetch: refetchDebt } = useQuery({
    queryKey: ["pay-debt", agentId, network?.id],
    enabled: !!agentId && !!network?.id,
    queryFn: async () => {
      const { data } = await supabase.from("card_requests")
        .select("total_value, paid_amount")
        .eq("agent_id", agentId)
        .eq("network_id", network!.id)
        .eq("status", "APPROVED");
      const rows = data ?? [];
      const total = rows.reduce((s, r: any) => s + Number(r.total_value || 0), 0);
      const paid = rows.reduce((s, r: any) => s + Number(r.paid_amount || 0), 0);
      return { total, paid, remaining: Math.max(total - paid, 0) };
    },
  });

  const agent = useMemo(() => agents?.find((a) => a.id === agentId), [agents, agentId]);
  const agentName = agent ? (agent.full_name || displayPhone((agent as any).phone, agent.username)) : "";
  const agentPhone = agent ? displayPhone((agent as any).phone, agent.username) : "";

  const settle = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!agentId) throw new Error("اختر المندوب");
      if (!amt || amt <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const { data, error } = await supabase.rpc("settle_agent_debt" as any, {
        _agent_id: agentId, _amount: amt, _note: note || null,
      });
      if (error) throw error;
      const r: any = Array.isArray(data) ? data[0] : data;
      return { applied: Number(r?.applied ?? 0), remaining_debt: Number(r?.remaining_debt ?? 0), payments_count: Number(r?.payments_count ?? 0) };
    },
    onSuccess: async (r) => {
      toast.success(`تم السداد — طُبِّق ${fmtMoney(r.applied)} • المتبقي ${fmtMoney(r.remaining_debt)}`);
      const dateStr = fmtArabicDateTimePdf(new Date());
      await printReceiptPDF({
        agentName, agentPhone,
        networkName: network?.name ?? "—",
        currency: (network as any)?.currency ?? "",
        amountPaid: r.applied,
        remaining: r.remaining_debt,
        prevRemaining: (debt?.remaining ?? 0),
        note, dateStr,
        adminName: profile?.full_name || profile?.username || "المدير",
      });
      qc.invalidateQueries({ queryKey: ["pay-debt"] });
      qc.invalidateQueries({ queryKey: ["card-requests"] });
      refetchDebt();
      setAmount(""); setNote("");
    },
    onError: (e: Error) => {
      const msg = e.message.includes("INVALID_AMOUNT") ? "أدخل مبلغاً صحيحاً" :
                  e.message.includes("AGENT_NOT_IN_NETWORK") ? "المندوب ليس ضمن شبكتك" :
                  e.message.includes("FORBIDDEN") ? "غير مسموح" : e.message;
      toast.error(msg);
    },
  });

  const currency = (network as any)?.currency ?? "";
  const remaining = debt?.remaining ?? 0;
  const canSubmit = !!agentId && Number(amount) > 0 && !settle.isPending;

  return (
    <>
      <PageHeader title="السداد" description="تسجيل سداد المندوب وخصمه من ديونه تلقائياً" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 card-elegant border-0 space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">المندوب</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
              <SelectContent>
                {agents?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {(a.full_name || displayPhone((a as any).phone, a.username))} ({displayPhone((a as any).phone, a.username)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">المبلغ المُسدَّد {currency && `(${currency})`}</Label>
            <Input
              type="number" inputMode="decimal" min="0" step="0.01"
              className="rounded-xl" placeholder="مثال: 100"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظة (اختياري)</Label>
            <Textarea
              className="rounded-xl" rows={2}
              placeholder="ملاحظة على السداد..."
              value={note} onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button
            onClick={() => settle.mutate()}
            disabled={!canSubmit}
            className="w-full rounded-xl gradient-primary-bg text-white"
          >
            <HandCoins className="h-4 w-4 ml-1" />
            {settle.isPending ? "جارٍ التسديد..." : "تسديد وإصدار سند PDF"}
          </Button>
        </Card>

        <Card className="p-4 card-elegant border-0 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <ReceiptIcon className="h-4 w-4 text-primary" /> ملخص حساب المندوب
          </div>
          {!agentId ? (
            <div className="text-sm text-muted-foreground">اختر مندوباً لعرض ديونه.</div>
          ) : (
            <>
              <Row label="المندوب" value={agentName || "—"} />
              <Row label="الهاتف" value={agentPhone || "—"} />
              <Row label="الشبكة" value={network?.name ?? "—"} />
              <Row label="إجمالي المستحق" value={`${fmtMoney(debt?.total ?? 0)} ${currency}`} />
              <Row label="المدفوع سابقاً" value={`${fmtMoney(debt?.paid ?? 0)} ${currency}`} tone="success" />
              <Row label="الدين المتبقي" value={`${fmtMoney(remaining)} ${currency}`} tone="warning" bold />
              {Number(amount) > 0 && (
                <Row
                  label="المتبقي بعد السداد"
                  value={`${fmtMoney(Math.max(remaining - Number(amount), 0))} ${currency}`}
                  tone="primary" bold
                />
              )}
              {agentPhone && agentPhone !== "—" && (
                <Button
                  variant="outline" className="w-full rounded-xl mt-1"
                  onClick={() => openWhatsApp(agentPhone, buildWhatsAppText({
                    agentName, networkName: network?.name ?? "—",
                    amount: Number(amount) || 0, remaining: Math.max(remaining - (Number(amount) || 0), 0),
                    currency, adminName: profile?.full_name || profile?.username || "المدير",
                  }))}
                >
                  <Share2 className="h-4 w-4 ml-1" />
                  إرسال رسالة تأكيد عبر واتساب
                </Button>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: "success" | "warning" | "primary"; bold?: boolean }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="flex items-center justify-between gap-3 text-sm rounded-lg bg-muted/40 px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`${toneCls} ${bold ? "font-extrabold" : "font-semibold"} [overflow-wrap:anywhere] text-left`}>{value}</span>
    </div>
  );
}

function buildWhatsAppText(p: {
  agentName: string; networkName: string; amount: number; remaining: number; currency: string; adminName: string;
}) {
  return [
    `سند سداد — ${p.networkName}`,
    `المندوب: ${p.agentName}`,
    `المبلغ المُسدَّد: ${fmtMoney(p.amount)} ${p.currency}`,
    `الدين المتبقي: ${fmtMoney(p.remaining)} ${p.currency}`,
    `التاريخ: ${new Date().toLocaleString("ar-EG")}`,
    `المدير: ${p.adminName}`,
    ``,
    `شكراً لتعاملكم معنا — كرتي`,
  ].join("\n");
}

function openWhatsApp(phone: string, text: string) {
  const digits = String(phone).replace(/\D/g, "");
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function printReceiptPDF(a: {
  agentName: string; agentPhone: string; networkName: string; currency: string;
  amountPaid: number; remaining: number; prevRemaining: number; note: string;
  dateStr: string; adminName: string;
}) {
  const { buildCreditReceiptPdfBlob } = await import("@/lib/receipt-pdf");
  const { sharePdfBlob } = await import("@/lib/native-pdf");

  let adminPhone = "";
  let adminUsername = "";
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    adminPhone = String(u?.phone || (u?.user_metadata as any)?.phone || "").replace(/\D/g, "");
    adminUsername = (u?.user_metadata as any)?.username || "";
  } catch {}

  const statement = a.note?.trim() ? a.note.trim() : `تسديد من ${a.agentName}`;

  const blob = await buildCreditReceiptPdfBlob({
    networkName: a.networkName,
    networkPhone: adminPhone,
    networkRegion: "الجمهورية اليمنية",
    agentName: a.agentName,
    amount: a.amountPaid,
    currency: a.currency,
    statement,
    dateStr: a.dateStr,
    adminName: a.adminName,
    adminUsername,
  });

  const title = `سند_إشعار_دائن_${a.agentName}_${new Date().toISOString().slice(0, 10)}`;
  await sharePdfBlob({ blob, filename: title, dialogTitle: "مشاركة أو طباعة السند" });
}
