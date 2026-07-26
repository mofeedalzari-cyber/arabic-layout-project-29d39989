import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";
import { Search, Receipt, Trash2, Pencil, CreditCard } from "lucide-react";
import { fmtMoney, fmtArabicDateTime } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";
import { toast } from "sonner";

export const Route = createFileRoute("/app/sales")({ component: SalesPage });

type SaleRow = {
  id: string;
  transaction_no: string;
  package_name: string;
  network_name: string;
  agent_username: string;
  agent_id: string | null;
  price: number;
  sold_at: string;
  buyer_name: string | null;
};

function SalesPage() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState<SaleRow | null>(null);
  const [toEdit, setToEdit] = useState<SaleRow | null>(null);
  const [editBuyer, setEditBuyer] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const { display: displayName } = useUserNames();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id, transaction_no, package_name, network_name, agent_username, agent_id, price, sold_at, buyer_name")
        .order("sold_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as SaleRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!q) return sales;
    const s = q.toLowerCase();
    return sales?.filter((r) =>
      r.transaction_no.toLowerCase().includes(s) ||
      r.package_name.toLowerCase().includes(s) ||
      r.network_name.toLowerCase().includes(s) ||
      r.agent_username.toLowerCase().includes(s) ||
      (r.buyer_name ?? "").toLowerCase().includes(s) ||
      displayName(r.agent_username).toLowerCase().includes(s)
    );
  }, [sales, q, displayName]);

  function canModify(s: SaleRow) {
    return isAdmin || s.agent_id === user?.id;
  }

  function openEdit(s: SaleRow) {
    setToEdit(s);
    setEditBuyer(s.buyer_name ?? "");
    setEditPrice(String(s.price ?? ""));
  }

  async function saveEdit() {
    if (!toEdit) return;
    setBusy(true);
    const payload: Record<string, any> = { buyer_name: editBuyer.trim() || null };
    if (isAdmin) {
      const p = Number(editPrice);
      if (!Number.isFinite(p) || p < 0) {
        toast.error("سعر غير صالح");
        setBusy(false);
        return;
      }
      payload.price = p;
    }
    const { error } = await supabase.from("sales").update(payload).eq("id", toEdit.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ التعديلات");
    setToEdit(null);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_sale", { _sale_id: toDelete.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف عملية البيع");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
    qc.invalidateQueries({ queryKey: ["agent-cabin"] });
    qc.invalidateQueries({ queryKey: ["cabin-cards"] });
  }

  return (
    <>
      <PageHeader title={isAdmin ? "جميع المبيعات" : "مبيعاتي"} description={`${filtered?.length ?? 0} عملية`} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث برقم العملية أو الاسم..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-xl" />
      </div>

      <div className="grid gap-2">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => <Card key={i} className="card-elegant border-0 h-16 animate-pulse" />) :
          filtered?.map((s) => (
            <Card key={s.id} className="card-elegant border-0 p-3 flex items-center gap-3 slide-up">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{s.package_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {s.network_name} · {displayName(s.agent_username)} · {fmtArabicDateTime(s.sold_at)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">{s.transaction_no}</div>
                {s.buyer_name && <div className="text-[11px] text-primary">المشتري: {s.buyer_name}</div>}
              </div>
              <div className="text-primary font-bold text-sm whitespace-nowrap">{fmtMoney(Number(s.price))}</div>
              {canModify(s) && (
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} title="تعديل">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setToDelete(s)} title="حذف">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))
        }
        {filtered?.length === 0 && <div className="text-center py-16 text-muted-foreground">لا توجد مبيعات.</div>}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف عملية البيع؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف عملية البيع {toDelete?.transaction_no} وإرجاع الكرت إلى حساب المندوب. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? "جاري..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!toEdit} onOpenChange={(o) => !o && setToEdit(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل عملية البيع</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المشتري</Label>
              <Input value={editBuyer} onChange={(e) => setEditBuyer(e.target.value)} placeholder="اختياري" />
            </div>
            {isAdmin && (
              <div>
                <Label>السعر</Label>
                <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToEdit(null)} disabled={busy}>إلغاء</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? "جاري..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
