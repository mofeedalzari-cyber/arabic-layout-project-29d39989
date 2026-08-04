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
  }

  async function submit() {
    if (!target) return;
    const customer = name.trim();
    if (customer.length < 2) return toast.error("اكتب اسمك أو اسم الزبون");
    setBusy(true);
    const { error } = await (supabase.rpc as any)("user_request_card", {
      _package_id: target.package_id,
      _customer_name: customer,
      _note: note.trim() || null,
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
      `\nيرجى الموافقة على الطلب لإظهار الكرت في حسابي.`;

    setTarget(null);
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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const c = r.color && r.color !== "none" ? r.color : null;
            return (
              <Card
                key={r.package_id}
                className="p-4 rounded-2xl border-0 shadow-md text-right"
                style={
                  c
                    ? { background: `linear-gradient(135deg, ${c} 0%, ${c}cc 100%)`, color: "#fff" }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl font-extrabold">{fmtMoney(Number(r.price))}</span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold truncate">{r.package_name}</h3>
                    <p className="text-xs opacity-80 flex items-center gap-1 justify-end">
                      <span className="truncate">{r.network_name}</span>
                      <Wifi className="h-3.5 w-3.5" />
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end mt-3 text-[11px] opacity-90">
                  {r.data_size && <Badge>{r.data_size}</Badge>}
                  {r.speed && <Badge>{r.speed}</Badge>}
                  {r.validity && (
                    <Badge>
                      <Clock className="h-3 w-3 inline ml-1" />
                      {r.validity}
                    </Badge>
                  )}
                  <Badge>{r.available > 0 ? `متاح ${r.available}` : "غير متاح"}</Badge>
                </div>

                <Button
                  className="w-full mt-4 rounded-xl bg-[#22a06b] hover:bg-[#1c8a5b] text-white"
                  onClick={() => openRequest(r)}
                >
                  <MessageCircle className="h-4 w-4 ml-1" />
                  طلب الكرت
                </Button>
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
            <p className="text-xs text-muted-foreground">
              سيتم إرسال رسالة واتساب لمدير الشبكة، ولن يظهر رقم الكرت إلا بعد موافقته.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => void submit()} disabled={busy} className="w-full">
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
