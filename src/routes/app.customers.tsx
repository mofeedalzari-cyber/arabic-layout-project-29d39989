import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { RefreshButton } from "@/components/refresh-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { Search, Users, MessageCircle, Receipt, TrendingUp, ShoppingBag, Trash2, FileText, Pencil, CreditCard, UserPlus, User as UserIcon, Banknote, Wallet, Plus } from "lucide-react";
import { fmtMoney, fmtArabicDateTime, fmtArabicDateTimePdf, displayPhone } from "@/lib/format";
import { openWhatsApp } from "@/lib/wa-open";
import { shareInvoiceImageOnWhatsApp } from "@/lib/customer-invoice-image";
import { pickContact } from "@/lib/pick-contact";
import { toast } from "sonner";
import { RevealText } from "@/components/reveal-text";

function localYemenDigits(v: string) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("967")) d = d.slice(3);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d;
}
function normalizeWa(v: string) {
  const d = localYemenDigits(v);
  return d ? "967" + d : "";
}

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
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWhats, setNewWhats] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [chargeFor, setChargeFor] = useState<Customer | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeNote, setChargeNote] = useState("");
  const [chargePackageId, setChargePackageId] = useState<string>("");
  const [chargeQty, setChargeQty] = useState<string>("1");
  const [chargeBusy, setChargeBusy] = useState(false);

  async function handleAddCustomer() {
    const name = newName.trim();
    const whatsapp = normalizeWa(newWhats);
    if (!name) { toast.error("أدخل اسم الزبون"); return; }
    if (whatsapp.length < 10) { toast.error("رقم واتساب غير صحيح"); return; }
    if (!user?.id) return;
    setAddBusy(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("network_id").eq("id", user.id).maybeSingle();
      const { error } = await supabase.from("customers").insert({
        agent_id: user.id,
        network_id: prof?.network_id ?? null,
        name,
        whatsapp,
      });
      if (error) { toast.error("تعذر إضافة الزبون: " + error.message); return; }
      toast.success("تم إضافة الزبون");
      setNewName(""); setNewWhats(""); setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["customers-page"] });
    } finally {
      setAddBusy(false);
    }
  }

  async function pickFromContacts() {
    const r = await pickContact();
    if (!r.ok) { if (r.error !== "cancelled") toast.error(r.message ?? "تعذّر جلب جهة الاتصال"); return; }
    if (r.contact?.name) setNewName(r.contact.name);
    if (r.contact?.phone) setNewWhats(localYemenDigits(r.contact.phone));
  }


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

  const { data: payments } = useQuery({
    queryKey: ["customer-payments", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_payments")
        .select("id, customer_id, amount, note, created_at")
        .eq("agent_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; customer_id: string; amount: number; note: string | null; created_at: string }[];
    },
  });

  const { data: packages } = useQuery({
    queryKey: ["customers-page-packages", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id, name, price, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; price: number; is_active: boolean }[];
    },
  });

  const paidByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments ?? []) {
      const amt = Number(p.amount || 0);
      if (amt > 0) m.set(p.customer_id, (m.get(p.customer_id) ?? 0) + amt);
    }
    return m;
  }, [payments]);

  const chargesByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments ?? []) {
      const amt = Number(p.amount || 0);
      if (amt < 0) m.set(p.customer_id, (m.get(p.customer_id) ?? 0) + Math.abs(amt));
    }
    return m;
  }, [payments]);

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
      const paid = paidByCustomer.get(c.id) ?? 0;
      const charges = chargesByCustomer.get(c.id) ?? 0;
      const grandTotal = st.total + charges;
      const balance = Math.max(grandTotal - paid, 0);
      return { ...c, ...st, paid, charges, grandTotal, balance };
    });
    const s = q.trim().toLowerCase();
    const filtered = s
      ? list.filter(
          (c) =>
            c.name.toLowerCase().includes(s) ||
            (c.whatsapp ?? "").toLowerCase().includes(s),
        )
      : list;
    return filtered.sort((a, b) => b.balance - a.balance);
  }, [customers, statsByCustomer, paidByCustomer, chargesByCustomer, q]);

  const selectedSales = useMemo(
    () => (selected ? (sales ?? []).filter((s) => s.customer_id === selected.id) : []),
    [selected, sales],
  );
  const selectedPayments = useMemo(
    () => (selected ? (payments ?? []).filter((p) => p.customer_id === selected.id) : []),
    [selected, payments],
  );
  const selectedSalesTotal = selectedSales.reduce((a, s) => a + (Number(s.price) || 0), 0);
  const selectedCharges = selectedPayments.filter((p) => Number(p.amount) < 0).reduce((a, p) => a + Math.abs(Number(p.amount) || 0), 0);
  const selectedTotal = selectedSalesTotal + selectedCharges;
  const selectedPaid = selectedPayments.filter((p) => Number(p.amount) > 0).reduce((a, p) => a + Number(p.amount || 0), 0);
  const selectedBalance = Math.max(selectedTotal - selectedPaid, 0);

  async function handleCustomerPayment() {
    if (!payFor || !user?.id) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    setPayBusy(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("network_id").eq("id", user.id).maybeSingle();
      const { error } = await supabase.from("customer_payments").insert({
        customer_id: payFor.id,
        agent_id: user.id,
        network_id: prof?.network_id ?? null,
        amount,
        note: payNote.trim() || null,
      });
      if (error) { toast.error("تعذر التسديد: " + error.message); return; }
      toast.success(`تم تسديد ${fmtMoney(amount)}`);
      setPayFor(null); setPayAmount(""); setPayNote("");
      qc.invalidateQueries({ queryKey: ["customer-payments"] });
    } finally {
      setPayBusy(false);
    }
  }

  async function deleteCustomerPayment(id: string) {
    const { error } = await supabase.from("customer_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["customer-payments"] });
  }

  async function handleAddCharge() {
    if (!chargeFor || !user?.id) return;
    const amount = Number(chargeAmount);
    if (!amount || amount <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    setChargeBusy(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("network_id").eq("id", user.id).maybeSingle();
      const pkg = packages?.find((p) => p.id === chargePackageId);
      const qty = Math.max(1, Number(chargeQty) || 1);
      const noteBase = chargeNote.trim();
      const parts: string[] = [];
      if (pkg) parts.push(`بيع خارجي: ${pkg.name}${qty > 1 ? ` × ${qty}` : ""}`);
      else parts.push("مبلغ مضاف");
      if (noteBase) parts.push(noteBase);
      const note = parts.join(" — ");
      const { error } = await supabase.from("customer_payments").insert({
        customer_id: chargeFor.id,
        agent_id: user.id,
        network_id: prof?.network_id ?? null,
        amount: -Math.abs(amount),
        note,
      });
      if (error) { toast.error("تعذر إضافة المبلغ: " + error.message); return; }
      toast.success(`تم إضافة ${fmtMoney(amount)}`);
      setChargeFor(null); setChargeAmount(""); setChargeNote(""); setChargePackageId(""); setChargeQty("1");
      qc.invalidateQueries({ queryKey: ["customer-payments"] });
    } finally {
      setChargeBusy(false);
    }
  }


  async function handleDelete(c: Customer) {
    setDeleteBusy(true);
    try {
      const { error } = await supabase.rpc("delete_customer", { _customer_id: c.id });
      if (error) {
        toast.error("تعذر حذف الزبون: " + error.message);
        return;
      }
      toast.success("تم حذف حساب الزبون مع بقاء المبيعات كما هي");
      setConfirmDelete(null);
      if (selected?.id === c.id) setSelected(null);
      qc.invalidateQueries({ queryKey: ["customers-page"] });
      qc.invalidateQueries({ queryKey: ["customer-sales"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["agent-cabin"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["dash-cards"] });
      qc.invalidateQueries({ queryKey: ["dash-sales-all"] });
      qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
    } finally {
      setDeleteBusy(false);
    }
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
      <div className="mb-4 flex justify-start"><RefreshButton /></div>


      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="إجمالي الزبائن" value={String(totals.customers)} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="زبائن نشِطون" value={String(totals.active)} />
        <StatCard icon={<ShoppingBag className="h-4 w-4" />} label="عمليات البيع" value={String(totals.sales)} />
        <StatCard icon={<Receipt className="h-4 w-4" />} label="إجمالي المبيعات" value={fmtMoney(totals.revenue)} />
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث باسم أو رقم واتساب..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-xl" />
        </div>
        <Button onClick={() => setAddOpen(true)} className="rounded-xl gradient-primary-bg text-white">
          <UserPlus className="h-4 w-4 ml-1" />
          إضافة زبون
        </Button>
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
                <div className={`text-[11px] font-bold ${c.balance > 0 ? "text-warning" : "text-success"}`}>
                  الرصيد: {fmtMoney(c.balance)}
                </div>
              </div>
            </div>
            {c.last && (
              <div className="text-[10px] text-muted-foreground mt-2">آخر عملية: {fmtArabicDateTime(c.last)}</div>
            )}
            <div className="flex gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 min-w-[110px]"
                disabled={sendingId === c.id}
                onClick={() => sendStatementWhatsApp(c as any)}
              >
                <FileText className="h-4 w-4 ml-1" />
                {sendingId === c.id ? "جاري..." : "كشف واتساب"}
              </Button>
              <Button
                size="sm"
                className="flex-1 min-w-[100px] bg-success hover:bg-success/90 text-white"
                disabled={c.balance <= 0}
                onClick={() => { setPayFor(c as any); setPayAmount(String(c.balance)); setPayNote(""); }}
              >
                <Banknote className="h-4 w-4 ml-1" />
                تسديد
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 min-w-[100px] border-warning/40 text-warning hover:bg-warning/10"
                onClick={() => { setChargeFor(c as any); setChargeAmount(""); setChargeNote(""); }}
              >
                <Plus className="h-4 w-4 ml-1" />
                إضافة مبلغ
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
              <TableHead className="text-right">المدفوع</TableHead>
              <TableHead className="text-right">الرصيد</TableHead>
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
                <TableCell className="text-success font-bold">{fmtMoney(c.paid)}</TableCell>
                <TableCell className={`font-bold ${c.balance > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(c.balance)}</TableCell>
                <TableCell className="text-xs">{c.last ? fmtArabicDateTime(c.last) : "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2 justify-end flex-wrap">
                    <Button
                      size="sm"
                      className="bg-success hover:bg-success/90 text-white"
                      disabled={c.balance <= 0}
                      onClick={() => { setPayFor(c as any); setPayAmount(String(c.balance)); setPayNote(""); }}
                    >
                      <Banknote className="h-4 w-4 ml-1" />
                      تسديد
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-warning/40 text-warning hover:bg-warning/10"
                      onClick={() => { setChargeFor(c as any); setChargeAmount(""); setChargeNote(""); }}
                    >
                      <Plus className="h-4 w-4 ml-1" />
                      إضافة مبلغ
                    </Button>
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
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
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
                  <div className="rounded-xl bg-success/10 p-3 text-center">
                    <div className="text-[11px] text-muted-foreground">المدفوع</div>
                    <div className="font-bold text-lg text-success">{fmtMoney(selectedPaid)}</div>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${selectedBalance > 0 ? "bg-warning/10" : "bg-success/10"}`}>
                    <div className="text-[11px] text-muted-foreground">الرصيد المتبقي</div>
                    <div className={`font-bold text-lg ${selectedBalance > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(selectedBalance)}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button
                    size="sm"
                    className="flex-1 min-w-[110px] bg-success hover:bg-success/90 text-white"
                    disabled={selectedBalance <= 0}
                    onClick={() => { setPayFor(selected); setPayAmount(String(selectedBalance)); setPayNote(""); }}
                  >
                    <Banknote className="h-4 w-4 ml-1" />
                    تسديد الزبون
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-w-[110px] border-warning/40 text-warning hover:bg-warning/10"
                    onClick={() => { setChargeFor(selected); setChargeAmount(""); setChargeNote(""); }}
                  >
                    <Plus className="h-4 w-4 ml-1" />
                    إضافة مبلغ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-w-[110px]"
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

              {selectedPayments.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">سجل التسديدات والمبالغ المضافة</div>
                  <Card className="border-0 card-elegant p-2 space-y-1.5">
                    {selectedPayments.map((p) => {
                      const amt = Number(p.amount);
                      const isCharge = amt < 0;
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {isCharge ? (
                              <Plus className="h-4 w-4 text-warning shrink-0" />
                            ) : (
                              <Wallet className="h-4 w-4 text-success shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className={`font-bold ${isCharge ? "text-warning" : "text-success"}`}>
                                {isCharge ? "+ " : ""}{fmtMoney(Math.abs(amt))}
                              </div>
                              <div className="text-[10px] text-muted-foreground">{fmtArabicDateTime(p.created_at)}</div>
                              {p.note && <div className="text-[11px] text-muted-foreground truncate">{p.note}</div>}
                            </div>
                          </div>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("حذف هذا القيد؟")) deleteCustomerPayment(p.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </Card>
                </div>
              )}

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
                                  <div className="flex items-center gap-1">
                                    <CreditCard className="h-3 w-3 text-primary" />
                                    <RevealText username={s.card_username} password={s.card_password} />
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-[11px] whitespace-nowrap">{fmtArabicDateTime(s.sold_at)}</TableCell>
                              <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{s.transaction_no}</TableCell>
                              <TableCell className="text-primary font-bold whitespace-nowrap">{fmtMoney(Number(s.price))}</TableCell>
                              <TableCell>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openSaleEdit(s)} title="تعديل">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
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
              هل أنت متأكد من حذف "{confirmDelete?.name}"؟ سيتم حذف سجل المبيعات المرتبطة به وإرجاع الكروت إلى حسابك. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && handleDelete(confirmDelete)} disabled={deleteBusy}>
              {deleteBusy ? "جاري..." : "حذف"}
            </AlertDialogAction>
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

      <Dialog open={addOpen} onOpenChange={(o) => { if (!addBusy) setAddOpen(o); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة زبون جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم الزبون</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: مفيد الزري" />
            </div>
            <div>
              <Label>رقم الواتساب</Label>
              <div className="flex items-stretch rounded-md border border-input overflow-hidden" dir="ltr">
                <span className="px-3 flex items-center text-sm font-mono bg-muted text-muted-foreground border-l border-input select-none">+967</span>
                <Input
                  value={localYemenDigits(newWhats)}
                  onChange={(e) => setNewWhats(localYemenDigits(e.target.value))}
                  placeholder="7XXXXXXXX"
                  inputMode="tel"
                  className="flex-1 rounded-none border-0 font-mono"
                />
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={pickFromContacts} disabled={addBusy}>
              <UserIcon className="h-4 w-4 ml-1" />
              اختيار من جهات الاتصال
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>إلغاء</Button>
            <Button onClick={handleAddCustomer} disabled={addBusy}>{addBusy ? "جاري..." : "إضافة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payFor} onOpenChange={(o) => { if (!payBusy && !o) { setPayFor(null); setPayAmount(""); setPayNote(""); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تسديد الزبون</DialogTitle>
          </DialogHeader>
          {payFor && (() => {
            const custStats = statsByCustomer.get(payFor.id) ?? { total: 0, count: 0, last: null };
            const paid = paidByCustomer.get(payFor.id) ?? 0;
            const remaining = Math.max(custStats.total - paid, 0);
            return (
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="text-muted-foreground">الزبون: <b className="text-foreground">{payFor.name}</b></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-primary/10 p-2">
                    <div className="font-extrabold text-primary text-sm">{fmtMoney(custStats.total)}</div>
                    <div className="text-[10px] text-muted-foreground">الإجمالي</div>
                  </div>
                  <div className="rounded-xl bg-success/10 p-2">
                    <div className="font-extrabold text-success text-sm">{fmtMoney(paid)}</div>
                    <div className="text-[10px] text-muted-foreground">المدفوع</div>
                  </div>
                  <div className="rounded-xl bg-warning/10 p-2">
                    <div className="font-extrabold text-warning text-sm">{fmtMoney(remaining)}</div>
                    <div className="text-[10px] text-muted-foreground">المتبقي</div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">مبلغ التسديد</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="rounded-xl h-11 text-center font-bold"
                    autoFocus
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button type="button" onClick={() => setPayAmount(String(remaining))}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70">كامل المتبقي</button>
                    <button type="button" onClick={() => setPayAmount(String(remaining / 2))}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70">نصف</button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">ملاحظة (اختياري)</Label>
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="rounded-xl" />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)} disabled={payBusy}>إلغاء</Button>
            <Button onClick={handleCustomerPayment} disabled={payBusy} className="bg-success hover:bg-success/90 text-white">
              {payBusy ? "جاري..." : "تأكيد التسديد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!chargeFor} onOpenChange={(o) => { if (!chargeBusy && !o) { setChargeFor(null); setChargeAmount(""); setChargeNote(""); setChargePackageId(""); setChargeQty("1"); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مبلغ على الزبون</DialogTitle>
          </DialogHeader>
          {chargeFor && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                الزبون: <b className="text-foreground">{chargeFor.name}</b>
              </div>
              <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">
                يُضاف هذا المبلغ إلى رصيد الزبون بدون تسجيل عملية بيع كرت. يمكنك اختيار الباقة إذا كان الكرت مُباعاً خارج التطبيق.
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">الباقة (اختياري — بيع خارجي)</Label>
                <select
                  value={chargePackageId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setChargePackageId(id);
                    const pkg = packages?.find((p) => p.id === id);
                    const qty = Math.max(1, Number(chargeQty) || 1);
                    if (pkg) setChargeAmount(String(Number(pkg.price) * qty));
                  }}
                  className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">— بدون باقة —</option>
                  {(packages ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.price)}</option>
                  ))}
                </select>
              </div>
              {chargePackageId && (
                <div>
                  <Label className="text-xs mb-1.5 block">الكمية</Label>
                  <Input
                    type="number" min={1} step="1"
                    value={chargeQty}
                    onChange={(e) => {
                      const v = e.target.value;
                      setChargeQty(v);
                      const pkg = packages?.find((p) => p.id === chargePackageId);
                      const qty = Math.max(1, Number(v) || 1);
                      if (pkg) setChargeAmount(String(Number(pkg.price) * qty));
                    }}
                    className="rounded-xl h-11 text-center font-bold"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs mb-1.5 block">المبلغ</Label>
                <Input
                  type="number" min={0} step="0.01"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  className="rounded-xl h-11 text-center font-bold"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">السبب / ملاحظة (اختياري)</Label>
                <Input value={chargeNote} onChange={(e) => setChargeNote(e.target.value)} placeholder="مثال: خدمة إضافية" className="rounded-xl" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeFor(null)} disabled={chargeBusy}>إلغاء</Button>
            <Button onClick={handleAddCharge} disabled={chargeBusy} className="bg-warning hover:bg-warning/90 text-white">
              {chargeBusy ? "جاري..." : "إضافة المبلغ"}
            </Button>
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
