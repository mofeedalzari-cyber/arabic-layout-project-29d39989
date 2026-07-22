import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Clock, Inbox, Wallet, Banknote } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUserNames } from "@/lib/use-user-names";
import { displayPhone, fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/app/requests")({ component: RequestsPage });

function RequestsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");

  return (
    <div dir="rtl">
      <PageHeader
        title="طلبات سحب الكروت"
        description={isAdmin ? "طلبات الوكلاء بانتظار الموافقة" : "طلباتك للكروت"}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} dir="rtl">
        <TabsList className="rounded-xl mb-4">
          <TabsTrigger value="PENDING" className="rounded-lg">قيد المراجعة</TabsTrigger>
          <TabsTrigger value="APPROVED" className="rounded-lg">مقبولة</TabsTrigger>
          <TabsTrigger value="REJECTED" className="rounded-lg">مرفوضة</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <RequestList status={tab} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RequestList({ status, isAdmin }: { status: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { display } = useUserNames();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["card-requests", status],
    queryFn: async () => {
      const { data, error } = await supabase.from("card_requests")
        .select("*").eq("status", status).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: phones } = useQuery({
    queryKey: ["profile-phones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("username, phone");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) m.set(p.username, displayPhone(p.phone, p.username));
      return m;
    },
    staleTime: 60_000,
  });

  const [rejectFor, setRejectFor] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [payFor, setPayFor] = useState<any>(null);
  const [payAmount, setPayAmount] = useState<string>("");

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("approve_card_request", { _request_id: id });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (r: any) => {
      toast.success(`تم الاعتماد — ${r.approved} كرت${r.remaining ? ` (${r.remaining} غير متوفر)` : ""}`);
      qc.invalidateQueries({ queryKey: ["card-requests"] });
      qc.invalidateQueries({ queryKey: ["agent-cabin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async ({ id, r }: { id: string; r: string }) => {
      const { error } = await supabase.rpc("reject_card_request", { _request_id: id, _reason: r });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الرفض");
      setRejectFor(null); setReason("");
      qc.invalidateQueries({ queryKey: ["card-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { data, error } = await supabase.rpc("record_request_payment", { _request_id: id, _amount: amount });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (r: any) => {
      toast.success(`تم تسجيل الدفعة — المتبقي ${fmtMoney(Number(r.remaining))}`);
      setPayFor(null); setPayAmount("");
      qc.invalidateQueries({ queryKey: ["card-requests"] });
    },
    onError: (e: Error) => {
      const msg = e.message.includes("EXCEEDS_TOTAL") ? "المبلغ يتجاوز المتبقي" :
                  e.message.includes("INVALID_AMOUNT") ? "أدخل مبلغاً صحيحاً" :
                  e.message.includes("NOT_APPROVED") ? "الطلب غير معتمد" : e.message;
      toast.error(msg);
    },
  });

  if (isLoading) return <div className="text-center py-16 text-muted-foreground">جارٍ التحميل...</div>;
  if (!rows?.length) return (
    <div className="text-center py-16 space-y-2">
      <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
      <div className="text-muted-foreground">لا توجد طلبات.</div>
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        {rows.map((r: any) => {
          const total = Number(r.total_value ?? 0);
          const paid = Number(r.paid_amount ?? 0);
          const remaining = Math.max(total - paid, 0);
          const isCash = r.payment_method === "CASH";
          const phone = phones?.get(r.agent_username) || displayPhone(null, r.agent_username);
          const fullName = display(r.agent_username);
          const qty = r.approved_quantity ?? r.quantity;
          return (
            <Card key={r.id} className="card-elegant border-0 p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="font-bold text-base">
                    <span className="text-muted-foreground text-xs font-normal">المندوب: </span>
                    {fullName}
                    {phone && <span className="text-muted-foreground text-xs mr-1">({phone})</span>}
                  </div>
                  <div><span className="text-muted-foreground text-xs">الشبكة: </span>{r.network_name}</div>
                  <div><span className="text-muted-foreground text-xs">الفئة: </span>{r.package_name}</div>
                  <div><span className="text-muted-foreground text-xs">عدد الكروت: </span><b>{qty}</b></div>
                  <div><span className="text-muted-foreground text-xs">القيمة الإجمالية: </span><b className="text-primary">{fmtMoney(total)}</b></div>
                  <div>
                    <span className="text-muted-foreground text-xs">المدفوع / المتبقي: </span>
                    <b className="text-success">{fmtMoney(paid)}</b>
                    <span className="text-muted-foreground"> / </span>
                    <b className="text-warning">{fmtMoney(remaining)}</b>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    التاريخ: {new Date(r.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {r.notes && <div className="text-xs bg-muted/50 rounded-lg p-2 mt-1">📝 {r.notes}</div>}
                  {r.reject_reason && <div className="text-xs bg-destructive/10 text-destructive rounded-lg p-2 mt-1">سبب الرفض: {r.reject_reason}</div>}
                </div>
                <StatusBadge status={r.status} />
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border/50">
                <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-xs font-semibold ${
                  isCash ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>
                  {isCash ? <Banknote className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
                  {isCash ? "نقد" : "آجل"}
                </div>
                {isAdmin && r.status === "PENDING" && (
                  <>
                    <Button disabled={approve.isPending} onClick={() => approve.mutate(r.id)}
                      className="rounded-lg gradient-primary-bg border-0 text-white h-9 px-3">
                      <Check className="h-4 w-4 ml-1" />اعتماد
                    </Button>
                    <Button variant="outline" className="rounded-lg h-9 px-3 text-destructive border-destructive/40"
                      onClick={() => { setRejectFor(r); setReason(""); }}>
                      <X className="h-4 w-4 ml-1" />رفض
                    </Button>
                  </>
                )}
                {isAdmin && r.status === "APPROVED" && remaining > 0 && (
                  <Button onClick={() => { setPayFor(r); setPayAmount(String(remaining)); }}
                    className="rounded-lg bg-success hover:bg-success/90 text-white h-9 px-3">
                    <Banknote className="h-4 w-4 ml-1" />تسجيل دفعة
                  </Button>
                )}
                {r.status === "APPROVED" && remaining === 0 && total > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-3 h-9 rounded-lg">
                    <Check className="h-3.5 w-3.5" />مسدد بالكامل
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="max-w-md rounded-3xl" dir="rtl">
          <DialogHeader><DialogTitle>رفض الطلب</DialogTitle></DialogHeader>
          {rejectFor && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                طلب <b>{display(rejectFor.agent_username)}</b> — {rejectFor.package_name} ({rejectFor.quantity})
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">سبب الرفض (اختياري)</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setRejectFor(null)}>إلغاء</Button>
                <Button disabled={reject.isPending} onClick={() => reject.mutate({ id: rejectFor.id, r: reason })}
                  className="flex-1 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                  تأكيد الرفض
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="max-w-md rounded-3xl" dir="rtl">
          <DialogHeader><DialogTitle>تسجيل دفعة</DialogTitle></DialogHeader>
          {payFor && (() => {
            const total = Number(payFor.total_value ?? 0);
            const paid = Number(payFor.paid_amount ?? 0);
            const remaining = Math.max(total - paid, 0);
            return (
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="text-muted-foreground">المندوب: <b className="text-foreground">{display(payFor.agent_username)}</b></div>
                  <div className="text-muted-foreground">الطلب: <b className="text-foreground">{payFor.package_name}</b></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="الإجمالي" value={fmtMoney(total)} c="text-primary" />
                  <MiniStat label="المدفوع" value={fmtMoney(paid)} c="text-success" />
                  <MiniStat label="المتبقي" value={fmtMoney(remaining)} c="text-warning" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">مبلغ الدفعة</Label>
                  <Input type="number" min={0} step="0.01" value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)} className="rounded-xl h-11 text-center font-bold" />
                  <div className="flex gap-1.5 mt-2">
                    <button type="button" onClick={() => setPayAmount(String(remaining))}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70">كامل المتبقي</button>
                    <button type="button" onClick={() => setPayAmount(String(remaining / 2))}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70">نصف</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setPayFor(null)}>إلغاء</Button>
                  <Button disabled={pay.isPending}
                    onClick={() => pay.mutate({ id: payFor.id, amount: Number(payAmount) })}
                    className="flex-1 rounded-xl bg-success hover:bg-success/90 text-white font-semibold">
                    تأكيد الدفعة
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniStat({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2">
      <div className={`font-extrabold ${c}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; l: string; Icon: any }> = {
    PENDING: { c: "bg-warning/15 text-warning", l: "قيد المراجعة", Icon: Clock },
    APPROVED: { c: "bg-success/15 text-success", l: "مقبول", Icon: Check },
    REJECTED: { c: "bg-destructive/15 text-destructive", l: "مرفوض", Icon: X },
  };
  const s = map[status] ?? map.PENDING;
  const Icon = s.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${s.c}`}>
      <Icon className="h-3 w-3" />{s.l}
    </span>
  );
}
