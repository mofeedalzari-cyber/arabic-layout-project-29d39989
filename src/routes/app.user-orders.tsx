import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtMoney, fmtArabicDateTime } from "@/lib/format";
import { openWhatsApp } from "@/lib/wa-open";
import { toast } from "sonner";
import { useState } from "react";
import { Inbox, Check, X, MessageCircle, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/user-orders")({ component: UserOrdersPage });

interface Row {
  id: string;
  user_id: string;
  customer_name: string | null;
  username: string | null;
  phone: string | null;
  package_id: string;
  package_name: string;
  network_id: string;
  network_name: string;
  price: number;
  status: string;
  note: string | null;
  reject_reason: string | null;
  available: number;
  created_at: string;
  approved_at: string | null;
}

function UserOrdersPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [delBusy, setDelBusy] = useState(false);


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-user-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_user_orders", { _status: null });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 15000,
  });

  async function approve(r: Row) {
    setBusy(r.id);
    const { error } = await (supabase.rpc as any)("approve_user_order", { _order_id: r.id });
    setBusy(null);
    if (error) {
      const m = String(error.message ?? "");
      if (m.includes("NO_CARDS_AVAILABLE")) return toast.error("لا توجد كروت متاحة لهذه الباقة");
      return toast.error("تعذر تنفيذ الموافقة");
    }
    void qc.invalidateQueries({ queryKey: ["admin-user-orders"] });
    toast.success("تمت الموافقة وظهر الكرت في حساب المستخدم");
  }


  async function reject(r: Row) {
    setBusy(r.id);
    const { error } = await (supabase.rpc as any)("reject_user_order", {
      _order_id: r.id,
      _reason: (reason[r.id] ?? "").trim() || null,
    });
    setBusy(null);
    if (error) return toast.error("تعذر رفض الطلب");
    void qc.invalidateQueries({ queryKey: ["admin-user-orders"] });
    toast.success("تم رفض الطلب");
  }
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = rows.length > 0 && selected.length === rows.length;

  async function removeSelected() {
    if (selected.length === 0) return;
    setDelBusy(true);
    const { error } = await (supabase.rpc as any)("admin_delete_user_orders", { _ids: selected });
    setDelBusy(false);
    if (error) {
      console.error(error);
      return toast.error("تعذر حذف الطلبات");
    }
    setSelected([]);
    void qc.invalidateQueries({ queryKey: ["admin-user-orders"] });
    toast.success("تم حذف الطلبات المحددة");
  }

  return (
    <div dir="rtl" className="space-y-4 text-right">
      <PageHeader title="طلبات المستخدمين" description="وافق على الطلب ليظهر الكرت في حساب المستخدم" />

      {rows.length > 0 && (
        <Card className="p-3 rounded-2xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="sel-all-user-orders"
              checked={allSelected}
              onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
            />
            <label htmlFor="sel-all-user-orders" className="text-sm">
              تحديد الكل ({selected.length}/{rows.length})
            </label>
          </div>
          <Button
            variant="destructive"
            className="rounded-xl h-9"
            disabled={selected.length === 0 || delBusy}
            onClick={() => void removeSelected()}
          >
            <Trash2 className="h-4 w-4 ml-1" />
            حذف المحدد
          </Button>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center text-muted-foreground py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">لا توجد طلبات</p>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id} className="p-4 rounded-2xl text-right space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-extrabold">{fmtMoney(Number(r.price))}</span>
                <div className="min-w-0 flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{r.customer_name ?? r.username ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.package_name} — {r.network_name}
                    </div>
                  </div>
                  <Checkbox
                    checked={selected.includes(r.id)}
                    onCheckedChange={() => toggle(r.id)}
                    aria-label="تحديد الطلب"
                    className="mt-1"
                  />
                </div>
              </div>
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtArabicDateTime(r.created_at)} — متاح {r.available}
                {r.note ? ` — ${r.note}` : ""}
              </div>

              {r.status === "PENDING" ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 rounded-xl bg-[#22a06b] hover:bg-[#1c8a5b] text-white"
                      disabled={busy === r.id}
                      onClick={() => void approve(r)}
                    >
                      <Check className="h-4 w-4 ml-1" />
                      موافقة
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      disabled={busy === r.id}
                      onClick={() => void reject(r)}
                    >
                      <X className="h-4 w-4 ml-1" />
                      رفض
                    </Button>
                    {r.phone && (
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => void openWhatsApp(r.phone!)}
                        aria-label="مراسلة المستخدم"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={reason[r.id] ?? ""}
                    onChange={(e) => setReason((s) => ({ ...s, [r.id]: e.target.value }))}
                    placeholder="سبب الرفض (اختياري)"
                    className="text-right h-9"
                  />
                </div>
              ) : (
                <div
                  className={
                    r.status === "PAID"
                      ? "text-sm font-bold text-[#22a06b]"
                      : "text-sm font-bold text-destructive"
                  }
                >
                  {r.status === "PAID"
                    ? "تمت الموافقة"
                    : `مرفوض${r.reject_reason ? ` — ${r.reject_reason}` : ""}`}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
