import { createFileRoute } from "@tanstack/react-router";
import { displayPhone, fmtMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Wifi, Package, ShoppingCart, DollarSign, Users, TrendingUp, Activity, Layers, UserCheck, FileSpreadsheet, FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useUserNames } from "@/lib/use-user-names";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { TableSection, SummaryRow } from "@/lib/dashboard-export";

// Lazy-loaded to keep exceljs/pdfmake out of the initial bundle
async function exportToExcel(...args: Parameters<typeof import("@/lib/dashboard-export").exportToExcel>) {
  const mod = await import("@/lib/dashboard-export");
  return mod.exportToExcel(...args);
}
async function exportToPDF(...args: Parameters<typeof import("@/lib/dashboard-export").exportToPDF>) {
  const mod = await import("@/lib/dashboard-export");
  return mod.exportToPDF(...args);
}
import { AgentStats } from "./app.agents";
import { MobileDataCard } from "@/components/mobile-data-card";

export const Route = createFileRoute("/app/")({ component: DashboardPage });

function DashboardPage() {
  const { role, profile } = useAuth();
  return role === "admin" ? <AdminDashboard /> : <AgentHome name={profile?.full_name || displayPhone(profile?.phone, profile?.username)} />;
}

function AdminDashboard() {
  const { display: displayName } = useUserNames();
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as {
        total_cards: number; available: number; sold: number;
        sold_value: number; available_value: number;
        networks: number; packages: number; agents: number;
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id, transaction_no, package_name, network_name, agent_username, price, sold_at")
        .order("sold_at", { ascending: false }).limit(6);
      if (error) throw error;
      return data;
    },
  });

  const { data: topAgents } = useQuery({
    queryKey: ["top-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("agent_username, price");
      if (error) throw error;
      const map = new Map<string, { count: number; total: number }>();
      for (const s of data) {
        const cur = map.get(s.agent_username) ?? { count: 0, total: 0 };
        cur.count++; cur.total += Number(s.price);
        map.set(s.agent_username, cur);
      }
      return [...map.entries()].map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.count - a.count).slice(0, 5);
    },
  });

  return (
    <div className="w-full max-w-full overflow-hidden">
      <PageHeader title="لوحة التحكم" description="نظرة شاملة على أداء المتجر" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 mb-5">
        <StatCard icon={Package} label="إجمالي الكروت" value={stats?.total_cards ?? 0} tone="primary" />
        <StatCard icon={ShoppingCart} label="المتوفر" value={stats?.available ?? 0} tone="success" />
        <StatCard icon={Activity} label="المباع" value={stats?.sold ?? 0} tone="warning" />
        <StatCard icon={DollarSign} label="قيمة المبيعات" value={fmtMoney(stats?.sold_value ?? 0)} tone="primary" />
        <StatCard icon={Wifi} label="الشبكات" value={stats?.networks ?? 0} />
        <StatCard icon={Package} label="الباقات" value={stats?.packages ?? 0} />
        <StatCard icon={Users} label="المناديب" value={stats?.agents ?? 0} />
        <StatCard icon={TrendingUp} label="قيمة المتوفر" value={fmtMoney(stats?.available_value ?? 0)} />
      </div>

      <AdminBreakdowns />

      <div className="grid md:grid-cols-2 gap-4 md:gap-6 mt-5">
        <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="font-bold text-sm sm:text-base">أحدث المبيعات</h3>
            <Link to="/app/sales" className="text-xs text-primary font-semibold shrink-0">عرض الكل ←</Link>
          </div>
          <div className="space-y-2">
            {recent?.length ? recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl bg-muted/40 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold [overflow-wrap:anywhere]">{s.package_name}</div>
                  <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.network_name} · {displayName(s.agent_username)}</div>
                </div>
                <div className="text-primary font-bold shrink-0 text-sm">{fmtMoney(Number(s.price))}</div>
              </div>
            )) : <EmptyMsg>لا مبيعات بعد.</EmptyMsg>}
          </div>
        </Card>

        <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
          <h3 className="font-bold mb-4 text-sm sm:text-base">أفضل المناديب مبيعًا</h3>
          <div className="space-y-2">
            {topAgents?.length ? topAgents.map((a, i) => (
              <div key={a.name} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-muted/40 text-sm">
                <div className="h-8 w-8 shrink-0 rounded-full gradient-primary-bg flex items-center justify-center font-bold text-xs">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold [overflow-wrap:anywhere]">{displayName(a.name)}</div>
                  <div className="text-xs text-muted-foreground">{a.count} عملية</div>
                </div>
                <div className="font-bold text-primary shrink-0 text-sm">{fmtMoney(a.total)}</div>
              </div>
            )) : <EmptyMsg>لا بيانات.</EmptyMsg>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AdminBreakdowns() {
  const { data: networks } = useQuery({
    queryKey: ["dash-networks"],
    queryFn: async () => (await supabase.from("networks").select("id, name, currency")).data ?? [],
  });
  const { data: packages } = useQuery({
    queryKey: ["dash-packages"],
    queryFn: async () => (await supabase.from("packages").select("id, name, price, network_id")).data ?? [],
  });
  const { data: cards } = useQuery({
    queryKey: ["dash-cards"],
    queryFn: async () => (await supabase.from("cards").select("id, status, package_id, network_id, assigned_to")).data ?? [],
  });
  const { data: sales } = useQuery({
    queryKey: ["dash-sales-all"],
    queryFn: async () => (await supabase.from("sales").select("agent_id, agent_username, package_id, network_id, price")).data ?? [],
  });
  const { data: paymentsCollected } = useQuery({
    queryKey: ["dash-payments-collected"],
    queryFn: async () => {
      const { data } = await supabase.from("card_requests").select("paid_amount").eq("status", "APPROVED");
      return (data ?? []).reduce((s, r: any) => s + Number(r.paid_amount || 0), 0);
    },
  });
  const { data: agents } = useQuery({
    queryKey: ["dash-agents"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
      const ids = roles?.map((r) => r.user_id) ?? [];
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, username, full_name, phone, is_active").in("id", ids).order("full_name");
      return data ?? [];
    },
  });

  const netMap = useMemo(() => new Map(networks?.map((n) => [n.id, n]) ?? []), [networks]);
  const pkgMap = useMemo(() => new Map(packages?.map((p) => [p.id, p]) ?? []), [packages]);
  const agentMap = useMemo(() => new Map(agents?.map((a) => [a.id, a]) ?? []), [agents]);

  const salesByPkg = useMemo(() => {
    const m = new Map<string, { network: string; pkg: string; total: number; sold: number; remaining: number; value: number; currency?: string }>();
    (packages ?? []).forEach((p) => {
      const net = netMap.get(p.network_id);
      m.set(p.id, { network: net?.name ?? "—", pkg: p.name, total: 0, sold: 0, remaining: 0, value: 0, currency: net?.currency });
    });
    (cards ?? []).forEach((c) => {
      const row = m.get(c.package_id);
      if (!row) return;
      row.total++;
      if (c.status === "SOLD") row.sold++;
      else if (c.status === "AVAILABLE") row.remaining++;
    });
    (sales ?? []).forEach((s) => {
      const row = m.get(s.package_id);
      if (row) row.value += Number(s.price || 0);
    });
    return Array.from(m.values()).sort((a, b) => b.sold - a.sold);
  }, [packages, cards, sales, netMap]);

  const summary = useMemo(() => {
    const list = cards ?? [];
    const total = list.length;
    const sold = list.filter((c) => c.status === "SOLD").length;
    const remaining = list.filter((c) => c.status === "AVAILABLE").length;
    const salesValue = (sales ?? []).reduce((s, r) => s + Number(r.price || 0), 0);
    const debts = list.reduce((s, c) => {
      if (c.status !== "ASSIGNED") return s;
      const p = pkgMap.get(c.package_id);
      return s + (p ? Number(p.price) : 0);
    }, 0);
    return { total, sold, remaining, salesValue, debts, collected: paymentsCollected ?? 0, agentsCount: agents?.length ?? 0 };
  }, [cards, sales, pkgMap, agents, paymentsCollected]);

  const agentStats = useMemo(() => {
    type Row = { agentId: string; agent: string; phone: string; pkg: string; price: number; currency?: string; holding: number };
    const m = new Map<string, Row>();
    (cards ?? []).forEach((c) => {
      if (c.status !== "ASSIGNED" || !c.assigned_to) return;
      const key = `${c.assigned_to}::${c.package_id}`;
      const pkg = pkgMap.get(c.package_id);
      const net = netMap.get(c.network_id);
      const ag = agentMap.get(c.assigned_to);
      const cur = m.get(key) ?? {
        agentId: c.assigned_to,
        agent: ag?.full_name || displayPhone((ag as any)?.phone, ag?.username),
        phone: displayPhone((ag as any)?.phone, ag?.username),
        pkg: pkg?.name ?? "—",
        price: pkg ? Number(pkg.price) : 0,
        currency: net?.currency,
        holding: 0,
      };
      cur.holding++;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.agent.localeCompare(b.agent));
  }, [cards, pkgMap, netMap, agentMap]);

  const buildExportData = (): { summary: SummaryRow[]; sections: TableSection[] } => {
    const sumRows: SummaryRow[] = [
      { label: "إجمالي الكروت المُضافة", value: summary.total },
      { label: "الكروت المُباعة", value: summary.sold },
      { label: "الكروت المتبقية", value: summary.remaining },
      { label: "عدد المناديب", value: summary.agentsCount },
      { label: "إجمالي قيمة المبيعات", value: fmtMoney(summary.salesValue) },
      { label: "إجمالي ديون المناديب", value: fmtMoney(summary.debts) },
      { label: "الرصيد", value: fmtMoney(summary.collected) },
    ];
    const sections: TableSection[] = [
      {
        title: "إحصائيات المبيعات حسب الفئات",
        cols: ["الشبكة", "الفئة", "إجمالي الكروت", "مباعة", "متبقية", "إجمالي القيمة"],
        rows: salesByPkg.map((r) => [
          r.network, r.pkg, r.total, r.sold, r.remaining,
          `${fmtMoney(r.value)}${r.currency ? " " + r.currency : ""}`,
        ]),
      },
      {
        title: "إحصائيات المناديب",
        cols: ["المندوب", "الهاتف", "الفئة", "لديه", "السعر"],
        rows: agentStats.map((r) => [
          r.agent, r.phone, r.pkg, r.holding,
          `${fmtMoney(r.price)}${r.currency ? " " + r.currency : ""}`,
        ]),
      },
      {
        title: "المناديب المرتبطين بالشبكة",
        cols: ["المندوب", "الهاتف", "الحالة"],
        rows: (agents ?? []).map((a) => [
          a.full_name || displayPhone((a as any).phone, a.username), displayPhone((a as any).phone, a.username), a.is_active ? "نشط" : "موقوف",
        ]),
      },
    ];
    return { summary: sumRows, sections };
  };

  const handleExcel = () => {
    const { summary: s, sections } = buildExportData();
    const stamp = new Date().toISOString().slice(0, 10);
    exportToExcel(`لوحة-التحكم-${stamp}`, s, sections);
  };
  const handlePDF = () => {
    const { summary: s, sections } = buildExportData();
    exportToPDF("لوحة التحكم — تقرير شامل", s, sections);
  };

  return (
    <div className="grid gap-4 md:gap-6 w-full max-w-full">
      <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-bold text-sm sm:text-base">ملخص الشبكة</h3>
          </div>
          <div className="flex flex-col sm:flex-row sm:mr-auto gap-2 w-full sm:w-auto">
            <Button size="sm" variant="outline" onClick={handleExcel} className="h-9 gap-1.5 text-xs w-full sm:w-auto">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              تصدير Excel
            </Button>
            <Button size="sm" variant="outline" onClick={handlePDF} className="h-9 gap-1.5 text-xs w-full sm:w-auto">
              <FileText className="h-3.5 w-3.5" />
              تصدير PDF
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <SummaryItem label="إجمالي الكروت المُضافة" value={fmtMoney(summary.total)} />
          <SummaryItem label="الكروت المُباعة" value={fmtMoney(summary.sold)} tone="success" />
          <SummaryItem label="الكروت المتبقية" value={fmtMoney(summary.remaining)} tone="warning" />
          <SummaryItem label="عدد المناديب" value={fmtMoney(summary.agentsCount)} />
          <SummaryItem label="إجمالي قيمة المبيعات" value={fmtMoney(summary.salesValue)} tone="primary" />
          <SummaryItem label="إجمالي ديون المناديب" value={fmtMoney(summary.debts)} tone="danger" />
          <SummaryItem label="الرصيد" value={fmtMoney(summary.collected)} tone="success" />

        </div>
      </Card>

      <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-bold text-sm sm:text-base">إحصائيات المبيعات حسب الفئات</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="sm:mr-auto h-9 gap-1.5 text-xs w-full sm:w-auto"
            onClick={() => {
              const totalCards = salesByPkg.reduce((s, r) => s + r.total, 0);
              const totalSold = salesByPkg.reduce((s, r) => s + r.sold, 0);
              const totalRemaining = salesByPkg.reduce((s, r) => s + r.remaining, 0);
              const totalValue = salesByPkg.reduce((s, r) => s + r.value, 0);
              const rows: (string | number)[][] = salesByPkg.map((r) => [
                r.network, r.pkg, r.total, r.sold, r.remaining,
                `${fmtMoney(r.value)}${r.currency ? " " + r.currency : ""}`,
              ]);
              rows.push(["الإجمالي", "", totalCards, totalSold, totalRemaining, fmtMoney(totalValue)]);
              const stamp = new Date().toISOString().slice(0, 10);
              exportToPDF(
                `إحصائيات المبيعات حسب الفئات — ${stamp}`,
                [],
                [{
                  title: "إحصائيات المبيعات حسب الفئات",
                  cols: ["الشبكة", "الفئة", "إجمالي الكروت", "مباعة", "متبقية", "إجمالي القيمة"],
                  rows,
                }],
              );
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            تصدير PDF
          </Button>
        </div>

        <PackagesChart data={salesByPkg} />
      </Card>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-bold text-sm sm:text-base">إحصائيات المناديب</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="sm:mr-auto h-9 gap-1.5 text-xs w-full sm:w-auto"
              onClick={() => {
                const rows: (string | number)[][] = agentStats.map((r) => [
                  r.agent,
                  r.phone,
                  r.pkg,
                  `${fmtMoney(r.price)}${r.currency ? " " + r.currency : ""}`,
                  r.currency ?? "",
                  r.holding,
                ]);
                const sumRows: SummaryRow[] = [
                  { label: "إجمالي الكروت المُضافة", value: fmtMoney(summary.total) },
                  { label: "الكروت المُباعة", value: fmtMoney(summary.sold) },
                  { label: "الكروت المتبقية", value: fmtMoney(summary.remaining) },
                  { label: "عدد المناديب", value: fmtMoney(summary.agentsCount) },
                  { label: "إجمالي قيمة المبيعات", value: fmtMoney(summary.salesValue) },
                  { label: "إجمالي ديون المناديب", value: fmtMoney(summary.debts) },
                  { label: "الرصيد", value: fmtMoney(summary.collected) },
                ];
                const stamp = new Date().toISOString().slice(0, 10);
                exportToPDF(
                  `إحصائيات المناديب — ${stamp}`,
                  sumRows,
                  [{
                    title: "إحصائيات المناديب",
                    cols: ["المندوب", "الهاتف", "الفئة", "القيمة الاسمية", "العملة", "المسحوبة"],
                    rows,
                  }],
                );
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              تصدير PDF
            </Button>
          </div>

          {(() => {
            const latestAgents = agentStats.slice(0, 3);
            return (
              <>
                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {latestAgents.length === 0 ? (
                    <EmptyMsg>لا توجد كروت مسحوبة حاليًا.</EmptyMsg>
                  ) : latestAgents.map((r, i) => (
                    <MobileDataCard
                      key={i}
                      title={r.agent}
                      fields={[
                        { label: "الهاتف", value: r.phone },
                        { label: "الفئة", value: r.pkg },
                        { label: "عدد الكروت", value: fmtMoney(r.holding), tone: "primary" },
                        { label: "السعر", value: `${fmtMoney(r.price)}${r.currency ? " " + r.currency : ""}` },
                      ]}
                    />
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table dir="rtl" className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground border-b border-border/50">
                        <th className="text-right font-medium px-2 py-2">المندوب</th>
                        <th className="text-right font-medium px-2 py-2">الهاتف</th>
                        <th className="text-right font-medium px-2 py-2">الفئة</th>
                        <th className="text-right font-medium px-2 py-2">لديه</th>
                        <th className="text-right font-medium px-2 py-2">السعر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestAgents.length === 0 ? (
                        <tr><td colSpan={5} className="text-center text-sm text-muted-foreground py-4">لا توجد كروت مسحوبة حاليًا.</td></tr>
                      ) : latestAgents.map((r, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-2 py-2">{r.agent}</td>
                          <td className="px-2 py-2">{r.phone}</td>
                          <td className="px-2 py-2">{r.pkg}</td>
                          <td className="px-2 py-2">{r.holding}</td>
                          <td className="px-2 py-2">{fmtMoney(r.price)}{r.currency ? " " + r.currency : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {agentStats.length > 3 && (
                  <div className="mt-3 flex justify-center">
                    <Button asChild size="sm" variant="outline" className="h-9 text-xs gap-1.5">
                      <Link to="/app/agents">
                        عرض الكل ({agentStats.length})
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            );
          })()}

        </Card>

      </div>
    </div>
  );
}

function SummaryItem({ label, value, tone }: { label: string; value: string; tone?: "primary" | "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : tone === "danger" ? "text-destructive"
    : tone === "primary" ? "text-primary"
    : "text-foreground";
  return (
    <div className="rounded-xl bg-muted/40 p-2.5 sm:p-3 min-w-0">
      <div className="text-[11px] text-muted-foreground mb-1 [overflow-wrap:anywhere]">{label}</div>
      <div className={`text-sm sm:text-base font-bold ${toneClass} [overflow-wrap:anywhere]`}>{value}</div>
    </div>
  );
}

function AgentHome({ name }: { name: string }) {
  const { user, profile } = useAuth();
  const { data: networks } = useQuery({
    queryKey: ["agent-networks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("networks")
        .select("id, name, description, primary_color, secondary_color, logo_url, cover_url, currency")
        .eq("is_active", true).order("created_at");
      if (error) throw error;
      return data;
    },
  });


  return (
    <div dir="rtl" className="w-full max-w-full overflow-hidden text-right">

      <PageHeader title={`أهلاً، ${name}`} description="اختر الشبكة ثم اطلع على إحصائياتك" />

      <div className="mb-3 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm sm:text-base">الشبكات المتاحة</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {networks?.map((n) => (
          <Link key={n.id} to="/app/networks/$id" params={{ id: n.id }} className="group block">
            <Card className="overflow-hidden border-0 shadow-md transition-transform duration-200 active:scale-[0.98]">
              <div
                className="h-32 sm:h-36 relative flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${n.primary_color || "#ef4444"}, ${n.secondary_color || "#14b8a6"})` }}
              >
                <Wifi className="h-14 w-14 sm:h-16 sm:w-16 text-white drop-shadow-sm" />
              </div>
              <div className="p-4 bg-background text-right">
                <h3 className="font-bold text-base sm:text-lg mb-1 [overflow-wrap:anywhere] text-foreground">{n.name}</h3>
                {n.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{n.description}</p>}
                <div className="text-xs sm:text-sm font-semibold text-primary inline-flex items-center gap-1">
                  عرض الباقات
                  <span>←</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {networks?.length === 0 && (
          <div className="col-span-full">
            <EmptyMsg>لا توجد شبكات متاحة حاليًا.</EmptyMsg>
          </div>
        )}
      </div>

      {user && (
        <div className="mb-4">
          <AgentStats
            agentId={user.id}
            name={profile?.full_name || displayPhone(profile?.phone, profile?.username) || name}
            username={profile?.username || ""}
          />
        </div>
      )}

    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string | number; tone?: "primary" | "success" | "warning" }) {
  const toneClass = tone === "success" ? "bg-success/15 text-success"
    : tone === "warning" ? "bg-warning/15 text-warning"
    : tone === "primary" ? "bg-primary/15 text-primary"
    : "bg-muted text-muted-foreground";
  return (
    <Card className="card-elegant border-0 p-3 sm:p-4 slide-up w-full max-w-full">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`rounded-xl p-2 sm:p-2.5 shrink-0 ${toneClass}`}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground leading-tight [overflow-wrap:anywhere]">{label}</div>
          <div className="text-base sm:text-lg font-bold [overflow-wrap:anywhere] leading-tight mt-1">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground py-8">{children}</div>;
}
