import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Search, Filter, Eye, EyeOff, ChevronsRight, ChevronRight, ChevronLeft, ChevronsLeft, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { displayPhone, fmtArabicDateTime } from "@/lib/format";
import { printAssignedCards } from "@/lib/card-print";

export const Route = createFileRoute("/app/manage-cards")({ component: ManageCardsPage });

const ALL = "__ALL__";
const PAGE_SIZE = 15;

type CardRow = {
  id: string;
  username: string;
  password: string | null;
  status: string;
  package_id: string;
  package_name: string;
  assigned_to: string | null;
  assigned_username: string | null;
  assigned_full_name?: string | null;
  sold_to: string | null;
  sold_username: string | null;
  sold_full_name?: string | null;
  created_at: string;
  assigned_at?: string | null;
  sold_at?: string | null;
};

function mask(v: string | null | undefined) {
  if (!v) return "—";
  if (v.length <= 6) return "•".repeat(Math.max(0, v.length));
  return `${v.slice(0, 3)}${"•".repeat(Math.max(4, v.length - 6))}${v.slice(-3)}`;
}

function ManageCardsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;

  const qc = useQueryClient();
  const [networkId, setNetworkId] = useState<string>("");
  const [packageId, setPackageId] = useState<string>(ALL);
  const [agentId, setAgentId] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [extendedDelete, setExtendedDelete] = useState(false);
  const [page, setPage] = useState(1);

  const { data: networks } = useQuery({
    queryKey: ["networks-all"],
    queryFn: async () => (await supabase.from("networks").select("id, name").order("name")).data ?? [],
  });

  const { data: packages } = useQuery({
    queryKey: ["pkgs-of", networkId],
    queryFn: async () => (await supabase.from("packages").select("id, name, price").eq("network_id", networkId).order("name")).data ?? [],
    enabled: !!networkId,
  });

  const { data: agents } = useQuery({
    queryKey: ["net-agents", networkId],
    queryFn: async () => {
      if (!networkId) return [];
      const { data, error } = await supabase.rpc("admin_list_cards", { _network_id: networkId });
      if (error) throw error;
      const rows = (data ?? []) as CardRow[];
      const ids = Array.from(new Set(rows.flatMap((r) => [r.assigned_to, r.sold_to]).filter(Boolean) as string[]));
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, username, phone").in("id", ids);
      return (profs ?? []).map((p: any) => ({
        id: p.id as string,
        name: (p.full_name as string | null) || displayPhone(p.phone as string | null, p.username as string | null) || (p.id as string).slice(0, 8),
      }));
    },
    enabled: !!networkId,
  });

  const { data: cards, isFetching } = useQuery({
    queryKey: ["admin-cards", networkId, packageId, agentId, search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_cards", {
        _network_id: networkId,
        _package_id: packageId === ALL ? undefined : packageId,
        _agent_id: agentId === ALL ? undefined : agentId,
        _search: search || undefined,
      });
      if (error) throw error;
      const rows = (data ?? []) as CardRow[];
      const ids = Array.from(new Set(rows.flatMap((r) => [r.assigned_to, r.sold_to]).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, username, phone").in("id", ids);
        const nameMap = new Map((profs ?? []).map((p: any) => [p.id, (p.full_name as string | null) || displayPhone(p.phone, p.username)]));
        rows.forEach((r) => {
          r.assigned_full_name = r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null;
          r.sold_full_name = r.sold_to ? nameMap.get(r.sold_to) ?? null : null;
        });
      }
      return rows;
    },
    enabled: !!networkId,
  });

  const totalPages = Math.max(1, Math.ceil((cards?.length ?? 0) / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => (cards ?? []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [cards, currentPage],
  );
  const pageIds = pageRows.map((r) => r.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const del = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return { deleted: 0, archived: 0 };
      const { data: soldRefs, error: sErr } = await supabase
        .from("sales").select("card_id").in("card_id", ids);
      if (sErr) throw sErr;
      const refSet = new Set((soldRefs ?? []).map((r: any) => r.card_id));
      const toArchive = ids.filter((id) => refSet.has(id));
      const toDelete = ids.filter((id) => !refSet.has(id));

      let archived = 0;
      if (toArchive.length && !extendedDelete) {
        const { data: upd, error: uErr } = await supabase
          .from("cards").update({ status: "SOLD" }).in("id", toArchive).neq("status", "SOLD").select("id");
        if (uErr) throw uErr;
        archived = upd?.length ?? 0;
      }
      const deleteIds = extendedDelete ? [...toDelete, ...toArchive] : toDelete;
      let deleted = 0;
      if (deleteIds.length) {
        const { data, error } = await supabase.rpc("admin_delete_cards", { _ids: deleteIds, _force: extendedDelete });
        if (error) throw error;
        const r = Array.isArray(data) ? data[0] : data;
        deleted = r?.deleted ?? 0;
      }
      return { deleted, archived };
    },
    onSuccess: (r: any) => {
      const parts: string[] = [];
      if (r.deleted) parts.push(`تم حذف ${r.deleted} كرت`);
      if (r.archived) parts.push(`تم أرشفة ${r.archived} كرت`);
      toast.success(parts.join(" — ") || "لا يوجد تغييرات");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-cards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delOldSold = useMutation({
    mutationFn: async () => {
      if (!cards) return { deleted: 0 };
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const ids = cards
        .filter((c) => (c.status === "SOLD" || c.status === "ASSIGNED") && new Date(c.created_at) < cutoff)
        .map((c) => c.id);
      if (!ids.length) return { deleted: 0 };
      const { data, error } = await supabase.rpc("admin_delete_cards", { _ids: ids, _force: true });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      return { deleted: r?.deleted ?? 0 };
    },
    onSuccess: (r: any) => {
      toast.success(r.deleted ? `تم حذف ${r.deleted} كرت قديم` : "لا يوجد كروت قديمة للحذف");
      qc.invalidateQueries({ queryKey: ["admin-cards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delOne = useMutation({
    mutationFn: async (id: string) => {
      const { data: refs } = await supabase.from("sales").select("card_id").eq("card_id", id).limit(1);
      if (refs && refs.length && !extendedDelete) {
        await supabase.from("cards").update({ status: "SOLD" }).eq("id", id);
        return { archived: true };
      }
      const { error } = await supabase.rpc("admin_delete_cards", { _ids: [id], _force: true });
      if (error) throw error;
      return { archived: false };
    },
    onSuccess: (r: any) => {
      toast.success(r.archived ? "تم أرشفة الكرت" : "تم حذف الكرت");
      qc.invalidateQueries({ queryKey: ["admin-cards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectPage() { setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => n.add(id)); return n; }); }
  function unselectPage() { setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => n.delete(id)); return n; }); }
  function selectAllSold() {
    setSelected((s) => {
      const n = new Set(s);
      (cards ?? []).filter((c) => c.status === "SOLD").forEach((c) => n.add(c.id));
      return n;
    });
  }
  function selectAllAssigned() {
    setSelected((s) => {
      const n = new Set(s);
      (cards ?? []).filter((c) => c.status === "ASSIGNED").forEach((c) => n.add(c.id));
      return n;
    });
  }
  function printAssigned() {
    const src = (cards ?? []).filter((c) => c.status === "ASSIGNED");
    const chosen = selected.size ? src.filter((c) => selected.has(c.id)) : src;
    if (!chosen.length) { toast.error("لا توجد كروت مسحوبة للطباعة"); return; }
    const netName = networks?.find((n) => n.id === networkId)?.name ?? "";
    printAssignedCards({
      networkName: netName,
      rows: chosen.map((c) => ({
        code: c.password ?? c.username,
        username: c.username,
        package_name: c.package_name,
        agent_name: c.assigned_full_name || displayPhone(null, c.assigned_username) || "—",
        assigned_at: c.assigned_at ?? c.created_at,
      })),
    });
  }
  function toggleReveal(id: string) {
    setRevealed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div dir="rtl">
      <PageHeader title="كروت الشبكة" description="فلترة وحذف جماعي" />

      <Card className="card-elegant border-0 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block">الشبكة</Label>
            <Select value={networkId} onValueChange={(v) => { setNetworkId(v); setPackageId(ALL); setAgentId(ALL); setSelected(new Set()); setPage(1); }}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر الشبكة" /></SelectTrigger>
              <SelectContent>{networks?.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">الفئة</Label>
            <Select value={packageId} onValueChange={(v) => { setPackageId(v); setSelected(new Set()); setPage(1); }} disabled={!networkId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="كل الباقات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الباقات</SelectItem>
                {packages?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">المندوب</Label>
            <Select value={agentId} onValueChange={(v) => { setAgentId(v); setSelected(new Set()); setPage(1); }} disabled={!networkId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل المناديب</SelectItem>
                {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">يتم عرض مناديب الشبكة المحددة فقط.</p>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">بحث</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="rounded-xl pr-9" placeholder="بحث باليوزر / الكود..."
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} disabled={!networkId} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          <span className="text-xs">المحدد: <b className="text-primary">{selected.size}</b> كرت</span>
          <div className="mr-auto flex items-center gap-2 text-xs">
            <Switch id="ext-del" checked={extendedDelete} onCheckedChange={setExtendedDelete} />
            <Label htmlFor="ext-del" className="cursor-pointer">وضع الحذف الموسع</Label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="rounded-lg h-9">
                  <Trash2 className="h-4 w-4 ml-1" />حذف المحدد ({selected.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف {selected.size} كرت؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    {extendedDelete
                      ? "الوضع الموسع مفعل: سيتم محاولة حذف الكل بما فيها المسحوبة/المباعة."
                      : "الكروت غير المرتبطة بمبيعات ستُحذف نهائيًا، والمرتبطة بمبيعات ستُؤرشف كـ (مباع)."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground">
                    تأكيد الحذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" className="rounded-lg h-9" onClick={selectPage} disabled={!pageRows.length}>تحديد الصفحة</Button>
          <Button variant="outline" className="rounded-lg h-9" onClick={unselectPage} disabled={!pageRows.length}>إلغاء تحديد الصفحة</Button>
          <Button variant="outline" className="rounded-lg h-9 text-destructive border-destructive/40" onClick={selectAllSold} disabled={!cards?.some((c) => c.status === "SOLD")}>تحديد كل المباع</Button>
          <Button variant="outline" className="rounded-lg h-9 text-blue-600 border-blue-500/40" onClick={selectAllAssigned} disabled={!cards?.some((c) => c.status === "ASSIGNED")}>تحديد كل المسحوب</Button>
          <Button variant="outline" className="rounded-lg h-9 text-blue-600 border-blue-500/40" onClick={printAssigned} disabled={!cards?.some((c) => c.status === "ASSIGNED")}>
            <Printer className="h-4 w-4 ml-1" />طباعة المسحوب
          </Button>
          <Button variant="outline" className="rounded-lg h-9" onClick={() => setSelected(new Set())} disabled={!selected.size}>مسح التحديد</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="rounded-lg h-9 text-destructive border-destructive/40">
                حذف المسحوبة/المباعة (أقدم من شهر)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>حذف الكروت القديمة؟</AlertDialogTitle>
                <AlertDialogDescription>سيتم حذف كل الكروت المسحوبة أو المباعة والتي مضى على إنشائها أكثر من 30 يومًا.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => delOldSold.mutate()} className="bg-destructive text-destructive-foreground">تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>

      {!networkId ? (
        <Card className="card-elegant border-0 p-10 text-center text-muted-foreground">
          <Filter className="h-8 w-8 mx-auto mb-3 opacity-50" />
          اختر شبكة لعرض الكروت
        </Card>
      ) : (
        <Card className="card-elegant border-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="p-3 w-10"><Checkbox checked={pageAllSelected} onCheckedChange={(v) => v ? selectPage() : unselectPage()} /></th>
                  <th className="p-3 text-right w-10">#</th>
                  <th className="p-3 text-right">الكود</th>
                  <th className="p-3 text-right">اسم المستخدم</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">المندوب</th>
                  <th className="p-3 text-right">تاريخ الإضافة</th>
                  <th className="p-3 text-right">تاريخ البيع</th>
                  <th className="p-3 text-right w-16">تحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((c, idx) => {
                  const agentName = c.status === "ASSIGNED" ? (c.assigned_full_name || displayPhone(null, c.assigned_username))
                    : c.status === "SOLD" ? (c.sold_full_name || displayPhone(null, c.sold_username)) : null;
                  const isRevealed = revealed.has(c.id);
                  const code = c.password ?? c.username;
                  return (
                    <tr key={c.id} className={selected.has(c.id) ? "bg-primary/5" : "hover:bg-muted/30"}>
                      <td className="p-3"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /></td>
                      <td className="p-3 text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="p-3 font-mono text-xs whitespace-nowrap">{isRevealed ? code : mask(code)}</td>
                      <td className="p-3">
                        <button onClick={() => toggleReveal(c.id)}
                          className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 bg-muted hover:bg-muted/70 font-mono">
                          {isRevealed ? <><EyeOff className="h-3 w-3" />{c.username}</> : <><Eye className="h-3 w-3" />إظهار</>}
                        </button>
                      </td>
                      <td className="p-3"><StatusBadge status={c.status} /></td>
                      <td className="p-3 text-xs">{agentName || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtArabicDateTime(c.created_at)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {c.sold_at
                          ? fmtArabicDateTime(c.sold_at)
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm("حذف هذا الكرت؟")) delOne.mutate(c.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">
                    {isFetching ? "جارٍ التحميل..." : "لا توجد كروت مطابقة"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-3 border-t bg-muted/20 text-xs">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => setPage(1)} disabled={currentPage === 1}><ChevronsRight className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronRight className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}><ChevronsLeft className="h-4 w-4" /></Button>
            </div>
            <div className="text-muted-foreground">
              الصفحة {currentPage} من {totalPages} — إجمالي {cards?.length ?? 0}
            </div>
          </div>
        </Card>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">
        تلميح: يمكنك تفعيل <b>وضع الحذف الموسع</b> للسماح بحذف الكروت المسحوبة/المباعة فورًا.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    AVAILABLE: { label: "متاح", cls: "bg-success/15 text-success border border-success/30" },
    ASSIGNED: { label: "مسحوب", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30" },
    SOLD: { label: "مباع", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}
