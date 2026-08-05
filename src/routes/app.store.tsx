import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { openWhatsApp } from "@/lib/wa-open";
import { toast } from "sonner";
import { PackageOpen, Wifi, MessageCircle, Clock } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/store")({ component: StorePage });

interface StoreRow {
  package_id: string;
  package_name: string;
  network_id: string;
  network_name: string;
  price: number;
  currency: string;
  color: string | null;
  data_size: string | null;
  speed: string | null;
  validity: string | null;
  available: number;
  admin_phone: string | null;
}

function StorePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [target, setTarget] = useState<StoreRow | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["user-store"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("user_store");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  function openRequest(row: StoreRow) {
    setTarget(row);
    setName(profile?.full_name ?? "");
    setNote("");
    setReceipt(null);
  }

  async function submit() {
    if (!target) return;
    const customer = name.trim();
    if (customer.length < 2) return toast.error("اكتب اسمك أو اسم الزبون");
    if (!receipt) return toast.error("ارفع صورة إيصال الدفع");
    setBusy(true);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setBusy(false);
      return toast.error("انتهت الجلسة، أعد تسجيل الدخول");
    }
    const ext = (receipt.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${uid}/${Date.now()}.${ext}`;
    const up = await supabase.storage
      .from("order-receipts")
      .upload(path, receipt, { contentType: receipt.type || "image/jpeg" });
    if (up.error) {
      setBusy(false);
      console.error(up.error);
      return toast.error("تعذر رفع صورة الإيصال");
    }

    const { error } = await (supabase.rpc as any)("user_request_card", {
      _package_id: target.package_id,
      _customer_name: customer,
      _note: note.trim() || null,
      _receipt_path: path,
    });
    setBusy(false);
    if (error) {
      console.error(error);
      return toast.error("تعذر إرسال الطلب");
    }

    const digits = (target.admin_phone ?? "").replace(/\D/g, "");
    const text =
      `طلب كرت جديد\n` +
      `الاسم: ${customer}\n` +
      `الباقة: ${target.package_name}\n` +
      `الشبكة: ${target.network_name}\n` +
      `السعر: ${fmtMoney(Number(target.price))}` +
      (note.trim() ? `\nملاحظة: ${note.trim()}` : "") +
      `\nتم رفع صورة إيصال الدفع في التطبيق.` +
      `\nيرجى الموافقة على الطلب لإظهار الكرت في حسابي.`;

    setTarget(null);
    setReceipt(null);
    toast.success("تم إرسال الطلب، بانتظار موافقة مدير الشبكة");
    if (digits) void openWhatsApp(digits, text);
    else toast.error("لا يوجد رقم واتساب للمدير");
    navigate({ to: "/app/my-orders" });
  }


  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader title="المتجر" description="اختر الباقة وأرسل طلب الكرت لمدير الشبكة" />

      {isLoading ? (
        <div className="text-center text-muted-foreground py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <PackageOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">لا توجد باقات متاحة حاليًا</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => {
            const c = r.color && r.color !== "none" ? r.color : null;
            const noStock = r.available === 0;
            return (
              <Card
                key={r.package_id}
                className={`card-elegant border-0 overflow-hidden p-0 ${c ? "text-white" : "pkg-plain"}`}
                style={c ? { background: `linear-gradient(135deg, ${c}, ${c}c0)` } : undefined}
              >
                <div className="p-5 relative">
                  <Wifi
                    className={`absolute top-3 left-3 h-5 w-5 ${c ? "text-white/40" : "text-muted-foreground/40"}`}
                  />
                  <div className={`text-[11px] mb-1 ${c ? "text-white/80" : "text-muted-foreground"}`}>
                    {r.network_name}
                  </div>
                  <div className={`text-sm mb-1 ${c ? "text-white" : "text-foreground"}`}>
                    {r.package_name}
                  </div>
                  <div className={`text-2xl font-extrabold ${c ? "text-white" : "text-foreground"}`}>
                    {fmtMoney(Number(r.price))}
                  </div>
                  <div
                    className={`mt-3 flex flex-wrap gap-1.5 text-[11px] ${c ? "text-white/90" : "text-muted-foreground"}`}
                  >
                    {r.data_size && (
                      <span className={`px-2 py-0.5 rounded-full ${c ? "bg-white/20" : "bg-muted"}`}>
                        {r.data_size}
                      </span>
                    )}
                    {r.speed && (
                      <span className={`px-2 py-0.5 rounded-full ${c ? "bg-white/20" : "bg-muted"}`}>
                        {r.speed}
                      </span>
                    )}
                    {r.validity && (
                      <span className={`px-2 py-0.5 rounded-full ${c ? "bg-white/20" : "bg-muted"}`}>
                        <Clock className="h-3 w-3 inline ml-1" />
                        {r.validity}
                      </span>
                    )}
                  </div>
                </div>
                <div className={`p-4 ${c ? "bg-black/10" : "bg-muted/40"}`}>
                  <div
                    className={`rounded-lg py-1.5 text-center text-xs mb-3 ${c ? "bg-white/15" : "bg-muted"}`}
                  >
                    <div className={`font-bold text-lg ${c ? "text-white" : "text-foreground"}`}>
                      {r.available}
                    </div>
                    <div className={`text-[10px] ${c ? "text-white/75" : "text-muted-foreground"}`}>
                      متاحة الآن
                    </div>
                  </div>
                  <Button
                    disabled={noStock}
                    onClick={() => openRequest(r)}
                    className={`w-full rounded-xl border-0 font-semibold h-10 ${c ? "bg-white text-foreground hover:bg-white/90" : "gradient-primary-bg text-primary-foreground hover:opacity-90"}`}
                  >
                    <MessageCircle className="h-4 w-4 ml-1" />
                    {noStock ? "لا كروت" : "طلب كرت"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent dir="rtl" className="text-right">
          <DialogHeader>
            <DialogTitle>طلب كرت — {target?.package_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك أو اسم الزبون"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label>ملاحظة (اختياري)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label>صورة إيصال الدفع (إلزامي)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                className="text-right file:ml-0 file:mr-2"
              />
              {receipt && (
                <p className="text-xs text-muted-foreground truncate">{receipt.name}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              سيتم إرسال رسالة واتساب لمدير الشبكة، ولن يظهر رقم الكرت إلا بعد موافقته.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void submit()}
              disabled={busy || !receipt}
              className="w-full"
            >
              {busy ? "جارٍ الإرسال…" : "إرسال الطلب عبر واتساب"}
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-black/10 px-2 py-0.5">{children}</span>;
}
