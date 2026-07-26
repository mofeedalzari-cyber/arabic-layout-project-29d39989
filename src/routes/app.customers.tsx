import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { Search, Users, MessageCircle, Receipt, TrendingUp, ShoppingBag, Trash2, FileText, Pencil, CreditCard } from "lucide-react";
import { fmtMoney, fmtArabicDateTime, fmtArabicDateTimePdf, displayPhone } from "@/lib/format";
import { openWhatsApp } from "@/lib/wa-open";
import { shareInvoiceImageOnWhatsApp } from "@/lib/customer-invoice-image";
import { toast } from "sonner";

export const Route = createFileRoute("/app/customers")({ component: CustomersPage });

type Customer = { id: string; name: string; whatsapp: string | null; created_at: string };
type Sale = { id: string; transaction_no: string; package_name: string; network_name: string; price: number; sold_at: string; customer_id: string | null; buyer_name: string | null; card_username: string | null; card_password: string | null };

function CustomersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
  const [editBuyer, setEditBuyer] = useState("");
  const [saleBusy, setSaleBusy] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ["customers-page", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, whatsapp, created_at")
        .eq("agent_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["customer-sales", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Sale[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, transaction_no, package_name, network_name, price, sold_at, customer_id, buyer_name, cards ( username, password )")
        .eq("agent_id", user!.id)
        .order("sold_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        card_username: s.cards?.username ?? null,
        card_password: s.cards?.password ?? null,
      })) as Sale[];
    },
  });

  const statsByCustomer = useMemo(() => {
    const m = new Map<string, { count: number; total: number; last: string | null }>();
    for (const s of sales ?? []) {
      if (!s.customer_id) continue;
      const cur = m.get(s.customer_id) ?? { count: 0, total: 0, last: null };
      cur.count += 1;
      cur.total += Number(s.price) || 0;
      if (!cur.last || s.sold_at > cur.last) cur.last = s.sold_at;
      m.set(s.customer_id, cur);
    }
    return m;
  }, [sales]);

  const totals = useMemo(() => {
    const linkedSales = (sales ?? []).filter((s) => s.customer_id);
    const totalRevenue = linkedSales.reduce((a, s) => a + (Number(s.price) || 0), 0);
    const activeCount = new Set(linkedSales.map((s) => s.customer_id)).size;
    return {
      customers: customers?.length ?? 0,
      active: activeCount,
      sales: linkedSales.length,
      revenue: totalRevenue,
    };
  }, [customers, sales]);

  const rows = useMemo(() => {
    const list = (customers ?? []).map((c) => {
      const st = statsByCustomer.get(c.id) ?? { count: 0, total: 0, last: null };
      return { ...c, ...st };
    });
    const s = q.trim().toLowerCase();
    const filtered = s
      ? list.filter(
          (c) =>
            c.name.toLowerCase().includes(s) ||
            (c.whatsapp ?? "").toLowerCase().includes(s),
        )
      : list;
    return filtered.sort((a, b) => b.total - a.total);
  }, [customers, statsByCustomer, q]);

  const selectedSales = useMemo(
    () => (selected ? (sales ?? []).filter((s) => s.customer_id === selected.id) : []),
    [selected, sales],
  );
  const selectedTotal = selectedSales.reduce((a, s) => a + (Number(s.price) || 0), 0);

  async function handleDelete(c: Customer) {
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) {
      toast.error("تعذر حذف الزبون: " + error.message);
      return;
    }
    toast.success("تم حذف الزبون");
    setConfirmDelete(null);
    if (selected?.id === c.id) setSelected(null);
    qc.invalidateQueries({ queryKey: ["customers-page"] });
    qc.invalidateQueries({ queryKey: ["customer-sales"] });
  }

  async function sendStatementWhatsApp(c: Customer) {
    if (sendingId) return;
    const custSales = (sales ?? []).filter((s) => s.customer_id === c.id);
    if (custSales.length === 0) {
      toast.error("لا توجد عمليات بيع لهذا الزبون");
      return;
    }
    setSendingId(c.id);
    try {
      // Fetch admin profile + network
      const uid = user?.id;
      let adminName = "";
      let adminUsername = "";
      let networkName = "";
      let currency = "ر.س";
      let networkPhone = "";
      let networkRegion = "";
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("username, full_name, phone, network_id")
          .eq("id", uid)
          .maybeSingle();
        adminName = (prof as any)?.full_name || (prof as any)?.username || "";
        adminUsername = (prof as any)?.username || "";
        networkPhone = String((prof as any)?.phone || "").replace(/\D/g, "");
        const netId = (prof as any)?.network_id;
        if (netId) {
          const { data: net } = await supabase
            .from("networks")
            .select("name, currency, description")
            .eq("id", netId)
            .maybeSingle();
          networkName = (net as any)?.name || "";
          currency = (net as any)?.currency || "ر.س";
          networkRegion = (net as any)?.description || "";
        }
      }
      // Fallback to sales data
      if (!networkName) networkName = custSales[0]?.network_name || "";

      // Group sales by package_name + price → qty
      const map = new Map<string, { packageName: string; networkName: string; qty: number; price: number }>();
      for (const s of custSales) {
        const key = `${s.package_name}||${Number(s.price)}`;
        const cur = map.get(key);
        if (cur) cur.qty += 1;
        else map.set(key, { packageName: s.package_name, networkName: s.network_name, qty: 1, price: Number(s.price) || 0 });
      }
      const items = Array.from(map.values());
      const total = custSales.reduce((a, s) => a + (Number(s.price) || 0), 0);

      // Arabic date d/m/yyyy
      const now = new Date();
      const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

      const msg =
        `الأخ/  الكريم\n\n` +
        `${c.name}\n\n` +
        `التاريخ : ${dateStr}\n\n` +
        `نود أن نبلغكم أنه  حسابكم  هو  مبلغ وقدره   ${fmtMoney(total)}.\n\n` +
        `*(فاتورة بيع آجـــل)*\n\n` +
        `الرصيد عليكم ${fmtMoney(total)}.\n\n` +
        `مع خالص التقدير والاحترام،\n\n` +
        `فريق ${networkName || "الشبكة"}`;


      if (!c.whatsapp) {
        toast.error("لا يوجد رقم واتساب لهذا الزبون");
        return;
      }

      await shareInvoiceImageOnWhatsApp({
        invoice: {
          networkName: networkName || "الشبكة",
          networkRegion,
          networkPhone,
          adminName,
          adminUsername,
          customerName: c.name,
          items: items.map((it) => ({
            packageName: it.packageName,
            networkName: it.networkName,
            qty: it.qty,
            price: it.price,
          })) as any,
          currency,
          dateStr,
        },
        message: msg,
        whatsappPhone: c.whatsapp,
        filenameBase: `كشف_${c.name}`,
      });

    } catch (err) {
      toast.error("تعذر إنشاء الفاتورة: " + String((err as any)?.message || err).slice(0, 120));
    } finally {
      setSendingId(null);
    }
  }



  function openSaleEdit(s: Sale) {
    setSaleToEdit(s);
    setEditBuyer(s.buyer_name ?? "");
  }

  async function saveSaleEdit() {
    if (!saleToEdit) return;
    setSaleBusy(true);
    const { error } = await supabase.from("sales").update({ buyer_name: editBuyer.trim() || null }).eq("id", saleToEdit.id);
    setSaleBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ التعديلات");
    setSaleToEdit(null);
    qc.invalidateQueries({ queryKey: ["customer-sales"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

  return (
    <>
      <PageHeader title="الزبائن" description="إدارة حسابات الزبائن وإحصائياتهم" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="إجمالي الزبائن" value={String(totals.customers)} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="زبائن نشِطون" value={String(totals.active)} />
        <StatCard icon={<ShoppingBag className="h-4 w-4" />} label="عمليات البيع" value={String(totals.sales)} />
        <StatCard icon={<Receipt className="h-4 w-4" />} label="إجمالي المبيعات" value={fmtMoney(totals.revenue)} />
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث باسم أو رقم واتساب..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-xl" />
      </div>

      {/* Mobile cards */}
      <div className="grid gap-2 lg:hidden">
        {rows.map((c) => (
          <Card key={c.id} className="card-elegant border-0 p-3 slide-up" onClick={() => setSelected(c)}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl gradient-primary-bg text-white flex items-center justify-center font-bold text-sm">
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">{displayPhone(c.whatsapp, "")}</div>
              </div>
              <div className="text-left">
                <div className="text-primary font-bold text-sm">{fmtMoney(c.total)}</div>
                <div className="text-[10px] text-muted-foreground">{c.count} عملية</div>
              </div>
            </div>
            {c.last && (
              <div className="text-[10px] text-muted-foreground mt-2">آخر عملية: {fmtArabicDateTime(c.last)}</div>
            )}
            <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={sendingId === c.id}
                onClick={() => sendStatementWhatsApp(c as any)}
              >
                <FileText className="h-4 w-4 ml-1" />
                {sendingId === c.id ? "جاري..." : "كشف واتساب"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDelete(c as any)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <div className="text-center py-16 text-muted-foreground">لا يوجد زبائن.</div>}
      </div>

      {/* Desktop table */}
      <Card className="card-elegant border-0 hidden lg:block overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">واتساب</TableHead>
              <TableHead className="text-right">عدد العمليات</TableHead>
              <TableHead className="text-right">إجمالي المبيعات</TableHead>
              <TableHead className="text-right">آخر عملية</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                <TableCell className="font-semibold">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">{displayPhone(c.whatsapp, "")}</TableCell>
                <TableCell>{c.count}</TableCell>
                <TableCell className="text-primary font-bold">{fmtMoney(c.total)}</TableCell>
                <TableCell className="text-xs">{c.last ? fmtArabicDateTime(c.last) : "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2 justify-end">
                    {c.whatsapp && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openWhatsApp(c.whatsapp!)}
                      >
                        <MessageCircle className="h-4 w-4 ml-1" />
                        واتساب
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === c.id}
                      onClick={() => sendStatementWhatsApp(c as any)}
                    >
                      <FileText className="h-4 w-4 ml-1" />
                      {sendingId === c.id ? "جاري..." : "كشف واتساب"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(c as any)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  لا يوجد زبائن.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>حساب الزبون</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4">
              <Card className="p-4 border-0 card-elegant">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl gradient-primary-bg text-white flex items-center justify-center font-bold">
                    {selected.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{selected.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{displayPhone(selected.whatsapp, "")}</div>
                  </div>
                  {selected.whatsapp && (
                    <Button
                      size="sm"
                      onClick={() => openWhatsApp(selected.whatsapp!)}
                    >
                      <MessageCircle className="h-4 w-4 ml-1" />
                      واتساب
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="rounded-xl bg-muted/50 p-3 text-center">
                    <div className="text-[11px] text-muted-foreground">عدد العمليات</div>
                    <div className="font-bold text-lg">{selectedSales.length}</div>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3 text-center">
                    <div className="text-[11px] text-muted-foreground">إجمالي المبيعات</div>
                    <div className="font-bold text-lg text-primary">{fmtMoney(selectedTotal)}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={sendingId === selected.id}
                    onClick={() => sendStatementWhatsApp(selected)}
                  >
                    <FileText className="h-4 w-4 ml-1" />
                    {sendingId === selected.id ? "جاري..." : "كشف حساب واتساب"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(selected)}>
                    <Trash2 className="h-4 w-4 ml-1" />
                    حذف
                  </Button>
                </div>
              </Card>

              <div>
                <div className="text-sm font-semibold mb-2">سجل المبيعات</div>
                {selectedSales.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">لا توجد عمليات بيع لهذا الزبون.</div>
                ) : (
                  <Card className="border-0 card-elegant overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-right whitespace-nowrap">#</TableHead>
                            <TableHead className="text-right whitespace-nowrap">الباقة</TableHead>
                            <TableHead className="text-right whitespace-nowrap">الكرت</TableHead>
                            <TableHead className="text-right whitespace-nowrap">التاريخ</TableHead>
                            <TableHead className="text-right whitespace-nowrap">رقم العملية</TableHead>
                            <TableHead className="text-right whitespace-nowrap">السعر</TableHead>
                            <TableHead className="text-right whitespace-nowrap">إجراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedSales.map((s, idx) => (
                            <TableRow key={s.id}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="font-semibold">{s.package_name}</div>
                                <div className="text-[11px] text-muted-foreground">{s.network_name}</div>
                                {s.buyer_name && (
                                  <div className="text-[11px] text-muted-foreground">المشتري: {s.buyer_name}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                {s.card_username ? (
                                  <div className="flex items-center gap-1 text-[12px] text-primary font-mono">
                                    <CreditCard className="h-3 w-3" />
                                    <span>{s.card_username}</span>
                                    {s.card_password && <span className="text-muted-foreground">/ {s.card_password}</span>}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-[11px] whitespace-nowrap">{fmtArabicDateTime(s.sold_at)}</TableCell>
                              <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{s.transaction_no}</TableCell>
                              <TableCell className="text-primary font-bold whitespace-nowrap">{fmtMoney(Number(s.price))}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openSaleEdit(s)} title="تعديل">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setSaleToDelete(s)} title="حذف">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-primary/5 font-bold">
                            <TableCell colSpan={5} className="text-right">الإجمالي</TableCell>
                            <TableCell className="text-primary whitespace-nowrap">{fmtMoney(selectedTotal)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                )}
              </div>

            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الزبون</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف "{confirmDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && handleDelete(confirmDelete)}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!saleToDelete} onOpenChange={(o) => !o && setSaleToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف عملية البيع؟</AlertDialogTitle>
            <AlertDialogDescription>
              اختر طريقة الحذف للعملية {saleToDelete?.transaction_no}: إما إرجاع الكرت إلى حسابك، أو حذف بدون إرجاع (حذف الكرت نهائياً).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => confirmSaleDelete(false)} disabled={saleBusy} className="w-full">
              {saleBusy ? "جاري..." : "إرجاع الكرت إلى حسابي"}
            </Button>
            <Button onClick={() => confirmSaleDelete(true)} disabled={saleBusy} variant="destructive" className="w-full">
              {saleBusy ? "جاري..." : "حذف بدون إرجاع"}
            </Button>
            <AlertDialogCancel disabled={saleBusy} className="w-full mt-0">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!saleToEdit} onOpenChange={(o) => !o && setSaleToEdit(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل عملية البيع</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المشتري</Label>
              <Input value={editBuyer} onChange={(e) => setEditBuyer(e.target.value)} placeholder="اختياري" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleToEdit(null)} disabled={saleBusy}>إلغاء</Button>
            <Button onClick={saveSaleEdit} disabled={saleBusy}>{saleBusy ? "جاري..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="card-elegant border-0 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-bold text-lg">{value}</div>
    </Card>
  );
}
