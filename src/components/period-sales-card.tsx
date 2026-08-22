import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtMoney } from "@/lib/format";
import { CalendarDays, CalendarRange, CalendarCheck } from "lucide-react";
import { RefreshButton } from "@/components/refresh-button";

type Row = { price: number; sold_at: string; package_name: string | null };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function PeriodSalesCard({ agentId }: { agentId?: string }) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfDay(now);
  weekStart.setDate(weekStart.getDate() - ((now.getDay() + 1) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, isLoading } = useQuery({
    queryKey: ["period-sales", agentId ?? "all", monthStart.toISOString().slice(0, 10)],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("price, sold_at, package_name")
        .gte("sold_at", monthStart.toISOString());
      if (agentId) q = q.eq("agent_id", agentId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });

  const periods: PeriodConfig[] = [
    {
      key: "month",
      icon: CalendarCheck,
      label: "مبيعات الشهر",
      from: monthStart,
      tone: "warning",
    },
    {
      key: "today",
      icon: CalendarDays,
      label: "مبيعات اليوم",
      from: dayStart,
      tone: "primary",
    },
    {
      key: "week",
      icon: CalendarRange,
      label: "مبيعات الأسبوع",
      from: weekStart,
      tone: "success",
    },
  ];

  return (
    <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-primary shrink-0" />
        <h2 className="font-bold text-sm sm:text-base">المبيعات حسب الفترة</h2>
        <div className="mr-auto">
          <RefreshButton />
        </div>
      </div>

      <div className="flex flex-row gap-3 overflow-x-auto pb-1">
        {periods.map((p) => (
          <PeriodBlock
            key={p.key}
            config={p}
            rows={data ?? []}
            loading={isLoading}
            className="min-w-[260px] flex-1"
          />
        ))}
      </div>
    </Card>
  );
}

type PeriodConfig = {
  key: string;
  icon: React.ElementType;
  label: string;
  from: Date;
  tone: "primary" | "success" | "warning";
};

function PeriodBlock({
  config,
  rows,
  loading,
}: {
  config: PeriodConfig;
  rows: Row[];
  loading?: boolean;
}) {
  const Icon = config.icon;
  const filtered = rows.filter((r) => new Date(r.sold_at) >= config.from);
  const count = filtered.length;
  const value = filtered.reduce((s, r) => s + Number(r.price || 0), 0);

  const packages = filtered.reduce((map, row) => {
    const name = row.package_name?.trim() || "باقة بدون اسم";
    const current = map.get(name) || 0;
    map.set(name, current + 1);
    return map;
  }, new Map<string, number>());

  const sortedPackages = Array.from(packages.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const toneClass =
    config.tone === "success"
      ? "bg-success/15 text-success"
      : config.tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-primary/15 text-primary";

  const textTone =
    config.tone === "success"
      ? "text-success"
      : config.tone === "warning"
        ? "text-warning"
        : "text-primary";

  return (
    <div className="rounded-xl bg-muted/40 p-3 sm:p-4 border border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <span className={`rounded-lg p-1.5 shrink-0 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">{config.label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
        <div className="flex flex-col">
          <span className={`text-lg sm:text-xl font-bold ${textTone}`}>
            {loading ? "..." : fmtMoney(value)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {loading ? "" : `${count} كرت مباع`}
          </span>
        </div>

        {!loading && sortedPackages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {sortedPackages.map((pkg) => (
              <span
                key={pkg.name}
                className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[11px] sm:text-xs font-medium text-foreground border border-border/50"
              >
                <span className="text-primary font-semibold">{pkg.count}</span>
                <span className="text-muted-foreground">{pkg.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {!loading && sortedPackages.length === 0 && (
        <div className="text-xs text-muted-foreground">لا توجد مبيعات في هذه الفترة</div>
      )}
    </div>
  );
}
