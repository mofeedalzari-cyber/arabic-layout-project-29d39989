import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { Search, Users, MessageCircle, Receipt, TrendingUp, ShoppingBag } from "lucide-react";
import { fmtMoney, fmtArabicDateTime, displayPhone } from "@/lib/format";

export const Route = createFileRoute("/app/customers")({ component: CustomersPage });

type Customer = { id: string; name: string; whatsapp: string | null; created_at: string };
type Sale = { id: string; transaction_no: string; package_name: string; network_name: string; price: number; sold_at: string; customer_id: string | null; buyer_name: string | null };

function CustomersPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

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
        .select("id, transaction_no, package_name, network_name, price, sold_at, customer_id, buyer_name")
        .eq("agent_id", user!.id)
        .order("sold_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sale[];
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
                <TableCell>
                  {c.whatsapp && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = String(c.whatsapp).replace(/\D/g, "");
                        window.open(`https://wa.me/${n}`, "_blank");
                      }}
                    >
                      <MessageCircle className="h-4 w-4 ml-1" />
                      واتساب
                    </Button>
                  )}
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
                      onClick={() => {
                        const n = String(selected.whatsapp).replace(/\D/g, "");
                        window.open(`https://wa.me/${n}`, "_blank");
                      }}
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
              </Card>

              <div>
                <div className="text-sm font-semibold mb-2">سجل المبيعات</div>
                <div className="grid gap-2">
                  {selectedSales.map((s) => (
                    <Card key={s.id} className="p-3 border-0 card-elegant">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{s.package_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {s.network_name} · {fmtArabicDateTime(s.sold_at)}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">{s.transaction_no}</div>
                        </div>
                        <div className="text-primary font-bold text-sm">{fmtMoney(Number(s.price))}</div>
                      </div>
                    </Card>
                  ))}
                  {selectedSales.length === 0 && (
                    <div className="text-center text-muted-foreground py-8 text-sm">لا توجد عمليات بيع لهذا الزبون.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
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
