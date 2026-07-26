import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";
import { Search, Pencil, Trash2 } from "lucide-react";
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
  card_username: string | null;
  card_password: string | null;
};

function SalesPage() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [toEdit, setToEdit] = useState<SaleRow | null>(null);
  const [editBuyer, setEditBuyer] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCards, setDeleteCards] = useState(false);
  const { display: displayName } = useUserNames();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id, transaction_no, package_name, network_name, agent_username, agent_id, price, sold_at, buyer_name, cards ( username, password )")
        .order("sold_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        card_username: s.cards?.username ?? null,
        card_password: s.cards?.password ?? null,
      })) as SaleRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!q) return sales ?? [];
    const s = q.toLowerCase();
    return (sales ?? []).filter((r) =>
      r.transaction_no.toLowerCase().includes(s) ||
      r.package_name.toLowerCase().includes(s) ||
      r.network_name.toLowerCase().includes(s) ||
      r.agent_username.toLowerCase().includes(s) ||
      (r.buyer_name ?? "").toLowerCase().includes(s) ||
      (r.card_username ?? "").toLowerCase().includes(s) ||
      displayName(r.agent_username).toLowerCase().includes(s)
    );
  }, [sales, q, displayName]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

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

  async function bulkDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = Array.from(selected);
    let ok = 0, fail = 0;
    for (const id of ids) {
      const { error } = await (supabase.rpc as any)("delete_sale", { _sale_id: id, _delete_card: deleteCards });
      if (error) fail++; else ok++;
    }
    setBusy(false);
    setConfirmDelete(false);
    setSelected(new Set());
    setDeleteCards(false);
    if (ok) toast.success(`تم حذف ${ok} عملية`);
    if (fail) toast.error(`فشل حذف ${fail}`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["cards"] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
  }

  return (
    <>
      <PageHeader title={isAdmin ? "جميع المبيعات" : "مبيعاتي"} description={`${filtered.length} عملية`} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم العملية أو الاسم..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-xl" />
        </div>
        {isAdmin && someSelected && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} className="gap-1">
            <Trash2 className="h-4 w-4" />
            حذف المحدد ({selected.size})
          </Button>
        )}
      </div>

      <Card className="card-elegant border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="تحديد الكل"
                    />
                  </TableHead>
                )}
                <TableHead className="text-right">#</TableHead>
                <TableHead className="text-right">رقم العملية</TableHead>
                <TableHead className="text-right">الباقة</TableHead>
                <TableHead className="text-right">الشبكة</TableHead>
                <TableHead className="text-right">المندوب</TableHead>
                <TableHead className="text-right">الكرت</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">السعر</TableHead>
                <TableHead className="text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={isAdmin ? 10 : 9} className="h-10 animate-pulse" /></TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-12 text-muted-foreground">
                    لا توجد مبيعات.
                  </TableCell>
                </TableRow>
              ) : filtered.map((s, i) => (
                <TableRow key={s.id} className={selected.has(s.id) ? "bg-primary/5" : ""}>
                  {isAdmin && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={() => toggleOne(s.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                  <TableCell className="font-mono text-[11px] whitespace-nowrap">{s.transaction_no}</TableCell>
                  <TableCell className="font-semibold">{s.package_name}</TableCell>
                  <TableCell className="text-xs">{s.network_name}</TableCell>
                  <TableCell className="text-xs">{displayName(s.agent_username)}</TableCell>
                  <TableCell className="font-mono text-xs text-primary whitespace-nowrap">
                    {s.card_username ?? "—"}
                    {s.card_password && <span className="text-muted-foreground"> / {s.card_password}</span>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtArabicDateTime(s.sold_at)}</TableCell>
                  <TableCell className="text-primary font-bold whitespace-nowrap">{fmtMoney(Number(s.price))}</TableCell>
                  <TableCell>
                    {canModify(s) && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} title="تعديل">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {selected.size} عملية بيع؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إرجاع الكروت المرتبطة إلى حالة "مُخصّصة" لدى المندوب، إلا إذا اخترت حذفها نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Checkbox id="del-cards" checked={deleteCards} onCheckedChange={(v) => setDeleteCards(!!v)} />
            <Label htmlFor="del-cards" className="cursor-pointer">حذف الكروت نهائياً (بدون إرجاع)</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} disabled={busy} className="bg-destructive hover:bg-destructive/90">
              {busy ? "جاري الحذف..." : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
