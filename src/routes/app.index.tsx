import { createFileRoute } from "@tanstack/react-router";
import { displayPhone, fmtMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { RefreshButton } from "@/components/refresh-button";
import { Card } from "@/components/ui/card";
import {
  Wifi,
  Package,
  ShoppingCart,
  DollarSign,
  Users,
  TrendingUp,
  Activity,
  Layers,
  UserCheck,
  FileSpreadsheet,
  FileText,
  Eraser,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
import type { TableSection, SummaryRow } from "@/lib/dashboard-export";

// Lazy-loaded to keep exceljs/pdfmake out of the initial bundle
async function exportToExcel(
  ...args: Parameters<typeof import("@/lib/dashboard-export").exportToExcel>
) {
  const mod = await import("@/lib/dashboard-export");
  return mod.exportToExcel(...args);
}
async function exportToPDF(
  ...args: Parameters<typeof import("@/lib/dashboard-export").exportToPDF>
) {
  const mod = await import("@/lib/dashboard-export");
  return mod.exportToPDF(...args);
}
import { AgentStats } from "./app.agents";

import { PackagesChart, AgentsChart } from "@/components/dashboard-charts";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "لوحة التحكم — كرتي" },
      {
        name: "description",
        content:
          "لوحة تحكم كرتي: ملخص الشبكة والمبيعات والباقات وأرصدة المناديب في مكان واحد لإدارة كروت الإنترنت.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "لوحة التحكم — كرتي" },
      {
        property: "og:description",
        content: "ملخص الشبكة والمبيعات وأرصدة المناديب داخل منصة كرتي.",
      },
    ],
  }),
});

function DashboardPage() {
  const { role, profile } = useAuth();
  return role === "admin" ? (
    <AdminDashboard />
  ) : (
    <AgentHome name={profile?.full_name || displayPhone(profile?.phone, profile?.username)} />
  );
}

function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as {
        total_cards: number;
        available: number;
        sold: number;
        sold_value: number;
        available_value: number;
        networks: number;
        packages: number;
        agents: number;
      };
    },
  });

  return (
    <div className="w-full max-w-full overflow-hidden">
      <PageHeader title="لوحة التحكم" description="نظرة شاملة على أداء المتجر" />
      <div className="mb-4 flex justify-start">
        <RefreshButton />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 mb-5">
        <StatCard
          icon={Package}
          label="إجمالي الكروت"
          value={stats?.total_cards ?? 0}
          tone="primary"
        />
        <StatCard
          icon={ShoppingCart}
          label="المتوفر"
          value={stats?.available ?? 0}
          tone="success"
        />
        <StatCard icon={Activity} label="المباع" value={stats?.sold ?? 0} tone="warning" />
        <StatCard
          icon={DollarSign}
          label="قيمة المبيعات"
          value={fmtMoney(stats?.sold_value ?? 0)}
          tone="primary"
        />
        <StatCard icon={Wifi} label="الشبكات" value={stats?.networks ?? 0} />
        <StatCard icon={Package} label="الباقات" value={stats?.packages ?? 0} />
        <StatCard icon={Users} label="المناديب" value={stats?.agents ?? 0} />
        <StatCard
          icon={TrendingUp}
          label="قيمة المتوفر"
          value={fmtMoney(stats?.available_value ?? 0)}
        />
      </div>

      <AdminBreakdowns />
    </div>
  );
}

type DashPkg = {
  package_id: string;
  pkg: string;
  price: number;
  total: number;
  sold: number;
  withdrawn: number;
  remaining: number;
  value: number;
};
type DashHolding = {
  agent_id: string;
  agent: string | null;
  phone: string | null;
  pkg: string | null;
  price: number;
  holding: number;
};
type DashAgent = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
};
type DashData = {
  currency?: string;
  network_name?: string;
  packages: DashPkg[];
  agent_holdings: DashHolding[];
  agents: DashAgent[];
  summary: {
    total: number;
    sold: number;
    remaining: number;
    salesValue: number;
    debts: number;
    collected: number;
    settled: number;
    agentsCount: number;
  };
};

function AdminBreakdowns() {
  // استعلام واحد مُجمَّع على السيرفر بدل تنزيل آلاف الكروت والمبيعات للجهاز
  const { data } = useQuery({
    queryKey: ["dash-breakdown"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_breakdown" as any);
      if (error) throw error;
      return data as unknown as DashData;
    },
    staleTime: 60_000,
  });

  const currency = data?.currency;
  const agents = data?.agents ?? [];

  const salesByPkg = useMemo(
    () =>
      (data?.packages ?? []).map((p) => ({
        network: data?.network_name ?? "—",
        pkg: p.pkg,
        total: Number(p.total || 0),
        sold: Number(p.sold || 0),
        withdrawn: Number(p.withdrawn || 0),
        remaining: Number(p.remaining || 0),
        value: Number(p.value || 0),
        currency,
      })),
    [data, currency],
  );

  const summary = useMemo(() => {
    const s = data?.summary;
    return {
      total: Number(s?.total ?? 0),
      sold: Number(s?.sold ?? 0),
      remaining: Number(s?.remaining ?? 0),
      salesValue: Number(s?.salesValue ?? 0),
      debts: Number(s?.debts ?? 0),
      collected: Number(s?.collected ?? 0),
      settled: Number(s?.settled ?? 0),
      agentsCount: Number(s?.agentsCount ?? 0),
    };
  }, [data]);

  const agentStats = useMemo(
    () =>
      (data?.agent_holdings ?? [])
        .map((h) => ({
          agentId: h.agent_id,
          agent: h.agent || displayPhone(h.phone, h.agent ?? "") || "—",
          phone: displayPhone(h.phone, "") || "—",
          pkg: h.pkg ?? "—",
          price: Number(h.price || 0),
          currency,
          holding: Number(h.holding || 0),
        }))
        .sort((a, b) => a.agent.localeCompare(b.agent)),
    [data, currency],
  );


  const buildExportData = (): { summary: SummaryRow[]; sections: TableSection[] } => {
    const sumRows: SummaryRow[] = [
      { label: "إجمالي الكروت المُضافة", value: summary.total },
      { label: "الكروت المُباعة", value: summary.sold },
      { label: "الكروت المتبقية", value: summary.remaining },
      { label: "عدد المناديب", value: summary.agentsCount },
      { label: "إجمالي قيمة المبيعات", value: fmtMoney(summary.salesValue) },
      { label: "إجمالي ديون المناديب", value: fmtMoney(summary.debts) },
      { label: "المسدد", value: fmtMoney(summary.settled) },
      { label: "الرصيد", value: fmtMoney(summary.collected) },
    ];
    const sections: TableSection[] = [
      {
        title: "إحصائيات المبيعات حسب الفئات",
        cols: ["الشبكة", "الفئة", "إجمالي الكروت", "مباعة", "متبقية", "إجمالي القيمة"],
        rows: salesByPkg.map((r) => [
          r.network,
          r.pkg,
          r.total,
          r.sold,
          r.remaining,
          fmtMoney(r.value),
        ]),
      },
      {
        title: "إحصائيات المناديب",
        cols: ["المندوب", "الهاتف", "الفئة", "لديه", "السعر"],
        rows: agentStats.map((r) => [r.agent, r.phone, r.pkg, r.holding, fmtMoney(r.price)]),
      },
      {
        title: "المناديب المرتبطين بالشبكة",
        cols: ["المندوب", "الهاتف", "الحالة"],
        rows: (agents ?? []).map((a) => [
          a.full_name || displayPhone((a as any).phone, a.username),
          displayPhone((a as any).phone, a.username),
          a.is_active ? "نشط" : "موقوف",
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleExcel}
              className="h-9 gap-1.5 text-xs w-full sm:w-auto"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              تصدير Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePDF}
              className="h-9 gap-1.5 text-xs w-full sm:w-auto"
            >
              <FileText className="h-3.5 w-3.5" />
              تصدير PDF
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <SummaryItem label="إجمالي الكروت المُضافة" value={String(summary.total)} />
          <SummaryItem label="الكروت المُباعة" value={String(summary.sold)} tone="success" />
          <SummaryItem label="الكروت المتبقية" value={String(summary.remaining)} tone="warning" />
          <SummaryItem label="عدد المناديب" value={String(summary.agentsCount)} />
          <SummaryItem
            label="إجمالي قيمة المبيعات"
            value={fmtMoney(summary.salesValue)}
            tone="primary"
          />
          <SummaryItem label="إجمالي ديون المناديب" value={fmtMoney(summary.debts)} tone="danger" />
          <SummaryItem label="المسدد" value={fmtMoney(summary.settled)} tone="primary" />
          <SummaryItem
            label="الرصيد"
            value={fmtMoney(summary.collected)}
            tone="success"
            action={<ResetBalanceButton amount={summary.collected} />}
          />
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
                r.network,
                r.pkg,
                r.total,
                r.sold,
                r.remaining,
                fmtMoney(r.value),
              ]);
              rows.push([
                "الإجمالي",
                "",
                totalCards,
                totalSold,
                totalRemaining,
                fmtMoney(totalValue),
              ]);
              const stamp = new Date().toISOString().slice(0, 10);
              exportToPDF(
                `إحصائيات المبيعات حسب الفئات — ${stamp}`,
                [],
                [
                  {
                    title: "إحصائيات المبيعات حسب الفئات",
                    cols: ["الشبكة", "الفئة", "إجمالي الكروت", "مباعة", "متبقية", "إجمالي القيمة"],
                    rows,
                  },
                ],
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
                  fmtMoney(r.price),
                  "",
                  r.holding,
                ]);
                const sumRows: SummaryRow[] = [
                  { label: "إجمالي الكروت المُضافة", value: String(summary.total) },
                  { label: "الكروت المُباعة", value: String(summary.sold) },
                  { label: "الكروت المتبقية", value: String(summary.remaining) },
                  { label: "عدد المناديب", value: String(summary.agentsCount) },
                  { label: "إجمالي قيمة المبيعات", value: fmtMoney(summary.salesValue) },
                  { label: "إجمالي ديون المناديب", value: fmtMoney(summary.debts) },
                  { label: "المسدد", value: fmtMoney(summary.settled) },
                  { label: "الرصيد", value: fmtMoney(summary.collected) },
                ];
                const stamp = new Date().toISOString().slice(0, 10);
                exportToPDF(`إحصائيات المناديب — ${stamp}`, sumRows, [
                  {
                    title: "إحصائيات المناديب",
                    cols: ["المندوب", "الهاتف", "الفئة", "القيمة الاسمية", "العملة", "المسحوبة"],
                    rows,
                  },
                ]);
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              تصدير PDF
            </Button>
          </div>

          <AgentsChart
            totals={{
              withdrawn: agentStats.reduce((s, r) => s + r.holding, 0),
              sold: summary.sold,
              remaining: summary.remaining,
            }}
          />

          {agentStats.length > 0 && (
            <div className="mt-3 flex justify-center">
              <Button asChild size="sm" variant="outline" className="h-9 text-xs gap-1.5">
                <Link to="/app/agents">عرض التفاصيل الكاملة</Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone,
  action,
}: {
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "danger";
  action?: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "primary"
            ? "text-primary"
            : "text-foreground";
  return (
    <div className="rounded-xl bg-muted/40 p-2.5 sm:p-3 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <div className="text-[11px] text-muted-foreground mb-1 [overflow-wrap:anywhere]">
          {label}
        </div>
        {action}
      </div>
      <div className={`text-sm sm:text-base font-bold ${toneClass} [overflow-wrap:anywhere]`}>
        {value}
      </div>
    </div>
  );
}

function ResetBalanceButton({ amount }: { amount: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_reset_balance" as any);
      if (error) throw error;
      const r: any = Array.isArray(data) ? data[0] : data;
      return { cleared: Number(r?.cleared ?? 0) };
    },
    onSuccess: (r) => {
      toast.success(`تم تصفير الرصيد — ${fmtMoney(r.cleared)}`);
      qc.invalidateQueries();
      setOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message.includes("FORBIDDEN") ? "غير مسموح" : e.message);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={amount <= 0}
        title="تصفير الرصيد"
      >
        <Eraser className="h-3 w-3" /> تصفير
      </Button>
      <AlertDialogContent dir="rtl" className="text-right">
        <AlertDialogHeader>
          <AlertDialogTitle>تصفير الرصيد</AlertDialogTitle>
          <AlertDialogDescription>
            سيتم تصفير الرصيد الحالي ({fmtMoney(amount)}) وخصم المبلغ المدفوع من إجمالي الدين لكل
            طلب. لن يتأثر الدين المتبقي على المناديب. لا يمكن التراجع عن هذه العملية.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={m.isPending}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              m.mutate();
            }}
            disabled={m.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {m.isPending ? "جارٍ التصفير..." : "تأكيد التصفير"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AgentHome({ name }: { name: string }) {
  const { user, profile } = useAuth();
  const { data: packages } = useQuery({
    queryKey: ["agent-packages", profile?.network_id],
    queryFn: async () => {
      if (!profile?.network_id) return [];
      const { data, error } = await supabase
        .from("packages")
        .select("id, name, description, price, allowed_time, network_id")
        .eq("network_id", profile.network_id)
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.network_id,
  });

  return (
    <div dir="rtl" className="w-full max-w-full overflow-hidden text-right">
      <PageHeader title={`أهلاً، ${name}`} description="لوحة البيع" />
      <div className="mb-4 flex justify-start">
        <RefreshButton />
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

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : tone === "primary"
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground";
  return (
    <Card className="card-elegant border-0 p-3 sm:p-4 slide-up w-full max-w-full">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`rounded-xl p-2 sm:p-2.5 shrink-0 ${toneClass}`}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground leading-tight [overflow-wrap:anywhere]">
            {label}
          </div>
          <div className="text-base sm:text-lg font-bold [overflow-wrap:anywhere] leading-tight mt-1">
            {value}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground py-8">{children}</div>;
}
