import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtMoney } from "@/lib/format";
import { CalendarDays, CalendarRange, CalendarCheck } from "lucide-react";
import { RefreshButton } from "@/components/refresh-button";

type Row = { price: number; sold_at: string };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function PeriodSalesCard({ agentId }: { agentId?: string }) {
  const now = new Date();
  const dayStart = startOfDay(now);
  // بداية الأسبوع: السبت (الأسبوع العربي)
  const weekStart = startOfDay(now);
  weekStart.setDate(weekStart.getDate() - ((now.getDay() + 1) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, isLoading } = useQuery({
    queryKey: ["period-sales", agentId ?? "all", monthStart.toISOString().slice(0, 10)],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("price, sold_at")
        .gte("sold_at", monthStart.toISOString());
      if (agentId) q = q.eq("agent_id", agentId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });

  const agg = (from: Date) => {
    const rows = (data ?? []).filter((r) => new Date(r.sold_at) >= from);
    return { count: rows.length, value: rows.reduce((s, r) => s + Number(r.price || 0), 0) };
  };

  const today = agg(dayStart);
  const week = agg(weekStart);
  const month = agg(monthStart);

  return (
    <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-primary shrink-0" />
        <h2 className="font-bold text-sm sm:text-base">المبيعات حسب الفترة</h2>
        <div className="mr-auto">
          <RefreshButton />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <PeriodItem
          icon={<CalendarDays className="h-4 w-4" />}
          label="مبيعات اليوم"
          count={today.count}
          value={today.value}
          loading={isLoading}
          tone="primary"
        />
        <PeriodItem
          icon={<CalendarRange className="h-4 w-4" />}
          label="مبيعات الأسبوع"
          count={week.count}
          value={week.value}
          loading={isLoading}
          tone="success"
        />
        <PeriodItem
          icon={<CalendarCheck className="h-4 w-4" />}
          label="مبيعات الشهر"
          count={month.count}
          value={month.value}
          loading={isLoading}
          tone="warning"
        />
      </div>
    </Card>
  );
}

function PeriodItem({
  icon,
  label,
  count,
  value,
  loading,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  value: number;
  loading?: boolean;
  tone: "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-primary/15 text-primary";
  const textTone =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="rounded-xl bg-muted/40 p-3 min-w-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`rounded-lg p-1.5 shrink-0 ${toneClass}`}>{icon}</span>
        <span className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{label}</span>
      </div>
      <div className={`text-base sm:text-lg font-bold ${textTone} [overflow-wrap:anywhere]`}>
        {loading ? "..." : fmtMoney(value)}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {loading ? "" : `${count} كرت مباع`}
      </div>
    </div>
  );
}
