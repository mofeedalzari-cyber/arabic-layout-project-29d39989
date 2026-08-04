import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtMoney, fmtArabicDateTime } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";
import { Copy, CheckCircle2, Clock, XCircle, Inbox, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/my-orders")({ component: MyOrdersPage });

interface OrderRow {
  id: string;
  package_name: string;
  network_name: string;
  price: number;
  status: string;
  customer_name: string | null;
  reject_reason: string | null;
  card_username: string | null;
  card_password: string | null;
  created_at: string;
  approved_at: string | null;
}

function MyOrdersPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("my_orders");
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
    refetchInterval: 15000,
  });

  function copy(v: string) {
    navigator.clipboard?.writeText(v);
    toast.success("تم النسخ");
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const allSelected = rows.length > 0 && selected.length === rows.length;

  async function removeSelected() {
    if (selected.length === 0) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("delete_my_orders", { _ids: selected });
    setBusy(false);
    if (error) {
      console.error(error);
      return toast.error("تعذر حذف الطلبات");
    }
    setSelected([]);
    void qc.invalidateQueries({ queryKey: ["my-orders"] });
    toast.success("تم حذف الطلبات المحددة");
  }

  return (
    <div dir="rtl" className="space-y-4 text-right">
      <PageHeader title="طلباتي" description="يظهر الكرت بعد موافقة مدير الشبكة" />

      {rows.length > 0 && (
        <Card className="p-3 rounded-2xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
              id="sel-all-my-orders"
            />
            <label htmlFor="sel-all-my-orders" className="text-sm">
              تحديد الكل ({selected.length}/{rows.length})
            </label>
          </div>
          <Button
            variant="destructive"
            className="rounded-xl h-9"
            disabled={selected.length === 0 || busy}
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
          <p className="text-muted-foreground">لا توجد طلبات بعد</p>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {rows.map((o) => (
            <Card key={o.id} className="p-4 rounded-2xl text-right space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-extrabold">{fmtMoney(Number(o.price))}</span>
                <div className="min-w-0 flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{o.package_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{o.network_name}</div>
                  </div>
                  <Checkbox
                    checked={selected.includes(o.id)}
                    onCheckedChange={() => toggle(o.id)}
                    aria-label="تحديد الطلب"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {o.customer_name ? `الاسم: ${o.customer_name} — ` : ""}
                {fmtArabicDateTime(o.created_at)}
              </div>

              {o.status === "PENDING" && (
                <div className="flex items-center gap-1 text-amber-600 text-sm font-bold justify-end">
                  <span>بانتظار موافقة مدير الشبكة</span>
                  <Clock className="h-4 w-4" />
                </div>
              )}

              {o.status === "REJECTED" && (
                <div className="text-sm text-destructive font-bold flex items-center gap-1 justify-end">
                  <span>مرفوض{o.reject_reason ? ` — ${o.reject_reason}` : ""}</span>
                  <XCircle className="h-4 w-4" />
                </div>
              )}

              {o.status === "PAID" && o.card_username && (
                <div className="rounded-2xl bg-[#c6dd00] text-black p-3 space-y-2">
                  <div className="flex items-center gap-1 justify-end font-extrabold">
                    <span>تمت الموافقة</span>
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <Row label="رقم الكرت" value={o.card_username} onCopy={copy} />
                  {o.card_password && (
                    <Row label="كلمة المرور" value={o.card_password} onCopy={copy} />
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-black hover:bg-black/10"
        onClick={() => onCopy(value)}
        aria-label={`نسخ ${label}`}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <span className="flex-1 text-right font-bold tracking-wider">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}
