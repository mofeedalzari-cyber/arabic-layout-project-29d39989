import { createFileRoute } from "@tanstack/react-router";
import { fmtMoney } from "@/lib/format";
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
import { exportToExcel, exportToPDF, type TableSection, type SummaryRow } from "@/lib/dashboard-export";
import { AgentStats } from "./app.agents";
import { MobileDataCard } from "@/components/mobile-data-card";

export const Route = createFileRoute("/app/")({ component: DashboardPage });

function DashboardPage() {
  const { role, profile } = useAuth();
  return role === "admin" ? <AdminDashboard /> : <AgentHome name={profile?.full_name || profile?.username || ""} />;
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
        <StatCard icon={Users} label="الوكلاء" value={stats?.agents ?? 0} />
        <StatCard icon={TrendingUp} label="قيمة المتوفر" value={fmtMoney(stats?.available_value ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
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
          <h3 className="font-bold mb-4 text-sm sm:text-base">أفضل الوكلاء مبيعًا</h3>
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

      <AdminBreakdowns />
    </div>
  );
}

function AdminBreakdowns() {
  const { display: displayName } = useUserNames();

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
  const { data: agents } = useQuery({
    queryKey: ["dash-agents"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
      const ids = roles?.map((r) => r.user_id) ?? [];
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, username, full_name, is_active").in("id", ids).order("full_name");
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
    return { total, sold, remaining, salesValue, debts, agentsCount: agents?.length ?? 0 };
  }, [cards, sales, pkgMap, agents]);

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
        agent: ag?.full_name || ag?.username || "—",
        phone: ag?.username ?? "—",
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
          displayName(r.phone), r.phone, r.pkg, r.holding,
          `${fmtMoney(r.price)}${r.currency ? " " + r.currency : ""}`,
        ]),
      },
      {
        title: "المناديب المرتبطين بالشبكة",
        cols: ["المندوب", "الهاتف", "الحالة"],
        rows: (agents ?? []).map((a) => [
          a.full_name || a.username, a.username, a.is_active ? "نشط" : "موقوف",
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
    <div className="grid gap-4 md:gap-6 mt-5 w-full max-w-full">
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

        {/* Mobile: cards */}
        <div className="md:hidden space-y-2">
          {salesByPkg.length === 0 ? (
            <EmptyMsg>لا توجد بيانات.</EmptyMsg>
          ) : salesByPkg.map((r, i) => (
            <MobileDataCard
              key={i}
              title={`${r.network} — ${r.pkg}`}
              fields={[
                { label: "إجمالي الكروت", value: fmtMoney(r.total) },
                { label: "المباع", value: fmtMoney(r.sold), tone: "success" },
                { label: "المتبقي", value: fmtMoney(r.remaining), tone: "warning" },
                { label: "القيمة", value: `${fmtMoney(r.value)}${r.currency ? " " + r.currency : ""}`, tone: "primary" },
              ]}
            />
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table dir="rtl" className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground border-b border-border/50">
                <th className="text-right font-medium px-2 py-2">الشبكة</th>
                <th className="text-right font-medium px-2 py-2">الفئة</th>
                <th className="text-right font-medium px-2 py-2">إجمالي الكروت</th>
                <th className="text-right font-medium px-2 py-2">مباعة</th>
                <th className="text-right font-medium px-2 py-2">متبقية</th>
                <th className="text-right font-medium px-2 py-2">إجمالي القيمة</th>
              </tr>
            </thead>
            <tbody>
              {salesByPkg.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-sm text-muted-foreground py-4">لا توجد بيانات.</td></tr>
              ) : salesByPkg.map((r, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-2 py-2">{r.network}</td>
                  <td className="px-2 py-2">{r.pkg}</td>
                  <td className="px-2 py-2">{r.total}</td>
                  <td className="px-2 py-2">{r.sold}</td>
                  <td className="px-2 py-2">{r.remaining}</td>
                  <td className="px-2 py-2">{fmtMoney(r.value)}{r.currency ? " " + r.currency : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  displayName(r.phone),
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

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {agentStats.length === 0 ? (
              <EmptyMsg>لا توجد كروت مسحوبة حاليًا.</EmptyMsg>
            ) : agentStats.map((r, i) => (
              <MobileDataCard
                key={i}
                title={displayName(r.phone)}
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
                {agentStats.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-sm text-muted-foreground py-4">لا توجد كروت مسحوبة حاليًا.</td></tr>
                ) : agentStats.map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-2 py-2">{displayName(r.phone)}</td>
                    <td className="px-2 py-2">{r.phone}</td>
                    <td className="px-2 py-2">{r.pkg}</td>
                    <td className="px-2 py-2">{r.holding}</td>
                    <td className="px-2 py-2">{fmtMoney(r.price)}{r.currency ? " " + r.currency : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-bold text-sm sm:text-base min-w-0 truncate">المناديب المرتبطين بالشبكة</h3>
            <span className="mr-auto shrink-0 text-[11px] bg-primary/15 text-primary rounded-full px-2 py-0.5 font-bold">
              {agents?.length ?? 0}
            </span>
          </div>
          {(agents ?? []).length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-4">لا يوجد مناديب.</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {(agents ?? []).map((a) => (
                  <MobileDataCard
                    key={a.id}
                    title={a.full_name || a.username}
                    headerRight={
                      <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${a.is_active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                        {a.is_active ? "نشط" : "موقوف"}
                      </span>
                    }
                    fields={[
                      { label: "الهاتف", value: a.username },
                      { label: "الحالة", value: a.is_active ? "نشط" : "موقوف", tone: a.is_active ? "success" : "danger" },
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
                      <th className="text-right font-medium px-2 py-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(agents ?? []).map((a) => (
                      <tr key={a.id} className="border-t border-border/50">
                        <td className="px-2 py-2">{a.full_name || a.username}</td>
                        <td className="px-2 py-2">{a.username}</td>
                        <td className="px-2 py-2">{a.is_active ? "نشط" : "موقوف"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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

  const { data: packages } = useQuery({
    queryKey: ["agent-packages-home"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages")
        .select("id, name, price, data_size, speed, validity, allowed_time, description, color, network_id")
        .eq("is_active", true).order("price", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const netMap = useMemo(() => new Map(networks?.map((n) => [n.id, n]) ?? []), [networks]);

  type Network = NonNullable<typeof networks>[number];
  type Package = NonNullable<typeof packages>[number];

  const packagesByNetwork = useMemo(() => {
    const groups = new Map<string, { network: Network; packages: Package[] }>();
    for (const n of networks ?? []) {
      groups.set(n.id, { network: n, packages: [] });
    }
    for (const p of packages ?? []) {
      const g = groups.get(p.network_id);
      if (g) g.packages.push(p);
    }
    const list = Array.from(groups.values()).filter((g) => g.packages.length > 0);
    const preferred = list.find((g) => g.network.name.includes("الزري"));
    const rest = list.filter((g) => g !== preferred);
    return preferred ? [preferred, ...rest] : list;
  }, [networks, packages]);

  return (
    <div dir="rtl" className="w-full max-w-full overflow-hidden text-right">

      <PageHeader title={`أهلاً، ${name}`} description="لوحة إحصائياتك واختيار الشبكات" />

      {user && (
        <div className="mb-5">
          <AgentStats
            agentId={user.id}
            name={profile?.full_name || profile?.username || name}
            username={profile?.username || ""}
          />
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm sm:text-base">الباقات المتاحة</h3>
      </div>

      <div className="space-y-4 mb-8">
        {packagesByNetwork.length === 0 && <EmptyMsg>لا توجد باقات متاحة حاليًا.</EmptyMsg>}
        {packagesByNetwork.map(({ network, packages: pkgs }) => (
          <Card key={network.id} className="card-elegant border-0 p-3 sm:p-4 w-full max-w-full">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `linear-gradient(135deg, ${network.primary_color}, ${network.secondary_color})` }}
              >
                <Wifi className="h-4 w-4 text-white/90" />
              </div>
              <h4 className="font-bold text-sm sm:text-base">{network.name}</h4>
              <Link to="/app/networks/$id" params={{ id: network.id }} className="mr-auto text-xs font-semibold text-primary">
                عرض الكل ←
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {pkgs.map((p) => (
                <Link key={p.id} to="/app/networks/$id" params={{ id: network.id }} className="group block">
                  <div
                    className="rounded-xl p-3 sm:p-4 border border-border/40 bg-card hover:border-primary/40 transition-colors"
                    style={{ borderInlineStartWidth: 4, borderInlineStartColor: p.color || "#009688" }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h5 className="font-bold text-sm [overflow-wrap:anywhere]">{p.name}</h5>
                      <span className="text-xs font-bold text-primary whitespace-nowrap">{fmtMoney(Number(p.price))}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                      {p.data_size && <span className="bg-muted/60 rounded-md px-1.5 py-0.5">{p.data_size}</span>}
                      {p.speed && <span className="bg-muted/60 rounded-md px-1.5 py-0.5">{p.speed}</span>}
                      {p.validity && <span className="bg-muted/60 rounded-md px-1.5 py-0.5">{p.validity}</span>}
                      {p.allowed_time && <span className="bg-muted/60 rounded-md px-1.5 py-0.5">{p.allowed_time}</span>}
                    </div>
                    {p.description && <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">{p.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm sm:text-base">الشبكات المتاحة</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {networks?.map((n) => (
          <Link key={n.id} to="/app/networks/$id" params={{ id: n.id }} className="group">
            <Card className="card-elegant card-elegant-hover overflow-hidden border-0 slide-up">
              <div className="h-24 relative"
                   style={{ background: `linear-gradient(135deg, ${n.primary_color}, ${n.secondary_color})` }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wifi className="h-12 w-12 text-white/90" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg mb-1 [overflow-wrap:anywhere]">{n.name}</h3>
                {n.description && <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>}
                <div className="mt-3 text-xs font-semibold text-primary">عرض الباقات ←</div>
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
