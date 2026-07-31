import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { RefreshButton } from "@/components/refresh-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { Search, Pencil, Trash2, ChevronUp, ChevronDown, X, Printer } from "lucide-react";
import { fmtMoney, fmtArabicDateTime, fmtArabicDateTimePdf } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";
import { toast } from "sonner";
import { RevealText } from "@/components/reveal-text";

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
  customer_id: string | null;
  customer_name: string | null;
  card_username: string | null;
  card_password: string | null;
};

type StatusFilter = "all" | "customer" | "direct";

function highlight(text: string, term: string) {
  if (!term) return text;
  const t = term.trim();
  if (!t) return text;
  try {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 rounded px-0.5">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  } catch {
    return text;
  }
}

function SalesPage() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [toEdit, setToEdit] = useState<SaleRow | null>(null);
  const [editBuyer, setEditBuyer] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCards, setDeleteCards] = useState(false);
  const [pageSize, setPageSize] = useState(-1);
  const [showScrollBtns, setShowScrollBtns] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const { display: displayName } = useUserNames();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, transaction_no, package_name, network_name, agent_username, agent_id, price, sold_at, buyer_name, customer_id, card_number, is_external, customers ( name ), cards ( username, password )",
        )
        .order("sold_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        customer_name: s.customers?.name ?? null,
        card_username: s.cards?.username ?? s.card_number ?? null,
        card_password: s.cards?.password ?? null,
      })) as SaleRow[];
    },
  });

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    (sales ?? []).forEach((s) => {
      if (s.customer_id && s.customer_name) map.set(s.customer_id, s.customer_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [sales]);

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>();
    (sales ?? []).forEach((s) => {
      if (s.agent_username) map.set(s.agent_username, displayName(s.agent_username));
    });
    return Array.from(map, ([u, name]) => ({ username: u, name }));
  }, [sales, displayName]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (sales ?? []).filter((r) => {
      if (customerFilter !== "all" && r.customer_id !== customerFilter) return false;
      if (agentFilter !== "all" && r.agent_username !== agentFilter) return false;
      if (statusFilter === "customer" && !r.customer_id) return false;
      if (statusFilter === "direct" && r.customer_id) return false;
      if (!s) return true;
      return (
        r.transaction_no.toLowerCase().includes(s) ||
        r.package_name.toLowerCase().includes(s) ||
        r.network_name.toLowerCase().includes(s) ||
        r.agent_username.toLowerCase().includes(s) ||
        (r.buyer_name ?? "").toLowerCase().includes(s) ||
        (r.customer_name ?? "").toLowerCase().includes(s) ||
        (r.card_username ?? "").toLowerCase().includes(s) ||
        displayName(r.agent_username).toLowerCase().includes(s)
      );
    });
  }, [sales, q, customerFilter, agentFilter, statusFilter, displayName]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;
  const displayedSales = pageSize === -1 ? filtered : filtered.slice(0, pageSize);
  const hasMore = filtered.length > displayedSales.length;
  const activeFilters =
    (customerFilter !== "all" ? 1 : 0) +
    (agentFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0);

  // The page-level scroller (app shell content area) handles vertical scrolling
  const getPageScroller = () => tableScrollRef.current;

  // Auto-hide scroll buttons based on scrollability
  useLayoutEffect(() => {
    const el = getPageScroller();
    if (!el) return;
    const check = () => setShowScrollBtns(el.scrollHeight > el.clientHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, [displayedSales.length, isLoading]);

  // Auto-scroll first result into view on search
  useEffect(() => {
    if (!q.trim()) return;
    const el = getPageScroller();
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "smooth" });
  }, [q]);

  function loadMore() {
    setPageSize((prev) => prev + 10);
  }

  function scrollSales(direction: "up" | "down") {
    const target = getPageScroller();
    if (!target) return;
    target.scrollBy({
      top: direction === "down" ? target.clientHeight * 0.85 : -target.clientHeight * 0.85,
      behavior: "smooth",
    });
  }


  function resetFilters() {
    setQ("");
    setCustomerFilter("all");
    setAgentFilter("all");
    setStatusFilter("all");
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
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
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حفظ التعديلات");
    setToEdit(null);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = Array.from(selected);
    let ok = 0,
      fail = 0;
    for (const id of ids) {
      const { error } = await (supabase.rpc as any)("delete_sale", {
        _sale_id: id,
        _delete_card: deleteCards,
      });
      if (error) fail++;
      else ok++;
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title={isAdmin ? "جميع المبيعات" : "مبيعاتي"}
          description={`عرض ${displayedSales.length} من ${filtered.length} عملية`}
        />
        <div className="mb-4 flex justify-start">
          <RefreshButton />
        </div>
      </div>

      {/* Search + Bulk */}
      <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم العملية / الاسم / الكرت..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-9 rounded-xl"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="مسح"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            printSalesPdf({ sales: filtered, isAdmin, agentFilter, agentOptions, displayName })
          }
          className="gap-1"
          disabled={filtered.length === 0}
        >
          <Printer className="h-4 w-4" />
          طباعة PDF
        </Button>
        {isAdmin && someSelected && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="gap-1"
          >
            <Trash2 className="h-4 w-4" />
            حذف المحدد ({selected.size})
          </Button>
        )}
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2 mb-0 shrink-0">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px] rounded-xl">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="customer">بيع آجل</SelectItem>
            <SelectItem value="direct">بيع مباشر</SelectItem>
          </SelectContent>
        </Select>

        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-[160px] rounded-xl">
            <SelectValue placeholder="الزبون" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الزبائن</SelectItem>
            {customerOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdmin && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue placeholder="المندوب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المناديب</SelectItem>
              {agentOptions.map((a) => (
                <SelectItem key={a.username} value={a.username}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="w-[130px] rounded-xl">
            <SelectValue placeholder="السجلات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 لكل صفحة</SelectItem>
            <SelectItem value="25">25 لكل صفحة</SelectItem>
            <SelectItem value="50">50 لكل صفحة</SelectItem>
            <SelectItem value="100">100 لكل صفحة</SelectItem>
            <SelectItem value="-1">عرض الكل</SelectItem>
          </SelectContent>
        </Select>

        {(activeFilters > 0 || q) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> مسح الفلاتر
          </Button>
        )}
      </div>

      <Card className="card-elegant relative mt-4 flex w-full min-h-0 flex-1 flex-col overflow-hidden border-0">
        {/* Plain scroll container: nothing wraps it that clips overflow, native
            touch scrolling on both axes (works inside Android WebView). */}
        <div
          ref={tableScrollRef}
          className="sales-scroll min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto overscroll-contain"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "auto",
          }}
        >
          <div className="w-max min-w-full pb-20">


          <Table className="w-[1100px] min-w-[1100px] table-fixed">
            <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
              <TableRow className="border-b-2">
                {isAdmin && (
                  <TableHead className="w-12 bg-card sticky top-0" data-no-drag>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="تحديد الكل"
                    />
                  </TableHead>
                )}
                <TableHead className="w-12 text-center bg-card sticky top-0">#</TableHead>
                <TableHead className="w-44 text-right bg-card sticky top-0">رقم العملية</TableHead>
                <TableHead className="w-28 text-right bg-card sticky top-0">الباقة</TableHead>
                <TableHead className="w-28 text-right bg-card sticky top-0">الشبكة</TableHead>
                <TableHead className="w-32 text-right bg-card sticky top-0">المندوب</TableHead>
                <TableHead className="w-32 text-right bg-card sticky top-0">الزبون</TableHead>
                <TableHead className="w-36 text-right bg-card sticky top-0">الكرت</TableHead>
                <TableHead className="w-36 text-right bg-card sticky top-0">التاريخ</TableHead>
                <TableHead className="w-24 text-right bg-card sticky top-0">السعر</TableHead>
                <TableHead className="w-16 text-center bg-card sticky top-0">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={isAdmin ? 11 : 10} className="h-10 animate-pulse" />
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 11 : 10}
                    className="text-center py-12 text-muted-foreground"
                  >
                    لا توجد مبيعات مطابقة.
                  </TableCell>
                </TableRow>
              ) : (
                displayedSales.map((s, i) => (
                  <TableRow key={s.id} className={selected.has(s.id) ? "bg-primary/5" : ""}>
                    {isAdmin && (
                      <TableCell data-no-drag>
                        <Checkbox
                          checked={selected.has(s.id)}
                          onCheckedChange={() => toggleOne(s.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-mono text-[11px] whitespace-nowrap">
                      {highlight(s.transaction_no, q)}
                    </TableCell>
                    <TableCell className="font-semibold">{highlight(s.package_name, q)}</TableCell>
                    <TableCell className="text-xs">{highlight(s.network_name, q)}</TableCell>
                    <TableCell className="text-xs">
                      {highlight(displayName(s.agent_username), q)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {highlight(s.customer_name ?? s.buyer_name ?? "—", q)}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs text-primary whitespace-nowrap"
                      data-no-drag
                    >
                      <RevealText username={s.card_username} password={s.card_password} />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fmtArabicDateTime(s.sold_at)}
                    </TableCell>
                    <TableCell className="text-primary font-bold whitespace-nowrap">
                      {fmtMoney(Number(s.price))}
                    </TableCell>
                    <TableCell data-no-drag>
                      {canModify(s) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(s)}
                          title="تعديل"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
        {showScrollBtns && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex gap-1 md:hidden animate-in fade-in duration-200">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-8 w-8 rounded-full shadow-elegant opacity-80"
              onClick={() => scrollSales("up")}
              aria-label="تمرير للأعلى"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-8 w-8 rounded-full shadow-elegant opacity-80"
              onClick={() => scrollSales("down")}
              aria-label="تمرير للأسفل"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}
        {hasMore && (
          <div className="border-t bg-muted/30 p-3 text-center">
            <Button variant="outline" size="sm" onClick={loadMore} className="gap-1 rounded-xl">
              عرض المزيد ({filtered.length - displayedSales.length} متبقي)
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={!!toEdit} onOpenChange={(o) => !o && setToEdit(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل عملية البيع</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المشتري</Label>
              <Input
                value={editBuyer}
                onChange={(e) => setEditBuyer(e.target.value)}
                placeholder="اختياري"
              />
            </div>
            {isAdmin && (
              <div>
                <Label>السعر</Label>
                <Input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToEdit(null)} disabled={busy}>
              إلغاء
            </Button>
            <Button onClick={saveEdit} disabled={busy}>
              {busy ? "جاري..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {selected.size} عملية بيع؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إرجاع الكروت المرتبطة إلى حالة "مُخصّصة" لدى المندوب، إلا إذا اخترت حذفها
              نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="del-cards"
              checked={deleteCards}
              onCheckedChange={(v) => setDeleteCards(!!v)}
            />
            <Label htmlFor="del-cards" className="cursor-pointer">
              حذف الكروت نهائياً (بدون إرجاع)
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              disabled={busy}
              className="bg-destructive hover:bg-destructive/90"
            >
              {busy ? "جاري الحذف..." : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

async function printSalesPdf(args: {
  sales: SaleRow[];
  isAdmin: boolean;
  agentFilter: string;
  agentOptions: { username: string; name: string }[];
  displayName: (u: string) => string;
}) {
  const { sales, isAdmin, agentFilter, agentOptions, displayName } = args;
  const { exportToPDF } = await import("@/lib/dashboard-export");

  // Replace internal spaces with non-breaking spaces so multi-word Arabic
  // names never wrap inside a narrow cell (wrapping breaks the RTL
  // token-reversal used by the PDF renderer and scrambles word order).
  const nb = (s: string | null | undefined) => String(s ?? "").replace(/ /g, "\u00A0");

  const agentLabel =
    agentFilter === "all"
      ? "كل المناديب"
      : agentOptions.find((a) => a.username === agentFilter)?.name || displayName(agentFilter);

  const total = sales.reduce((sum, s) => sum + Number(s.price || 0), 0);

  const summary = [
    { label: "المندوب", value: nb(agentLabel) },
    { label: "عدد العمليات", value: sales.length },
    { label: "إجمالي القيمة", value: fmtMoney(total) },
  ];

  const cols = isAdmin
    ? ["رقم العملية", "الباقة", "الشبكة", "المندوب", "الزبون", "الكرت", "التاريخ", "السعر"]
    : ["رقم العملية", "الباقة", "الشبكة", "الزبون", "الكرت", "التاريخ", "السعر"];

  const rows = sales.map((s) => {
    const card = s.card_username
      ? s.card_password
        ? `${s.card_username} / ${s.card_password}`
        : s.card_username
      : "—";
    const base = [s.transaction_no, s.package_name, s.network_name];
    const tail = [
      nb(s.customer_name ?? s.buyer_name ?? "—"),
      card,
      fmtArabicDateTimePdf(s.sold_at),
      fmtMoney(Number(s.price)),
    ];
    return isAdmin ? [...base, nb(displayName(s.agent_username)), ...tail] : [...base, ...tail];
  });

  const title = `تقرير_المبيعات_${agentLabel}`;
  await exportToPDF(title, summary, [{ title: "جميع المبيعات", cols, rows }], {
    reportName: `تقرير المبيعات — ${agentLabel}`,
  });
}
