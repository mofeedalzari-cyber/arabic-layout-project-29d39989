import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";

export type TimelineMonth = {
  key: string;
  label: string;
  packages: { pkg: string; network: string; count: number; total: number }[];
};

const PALETTE = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 72% 51%)",
  "hsl(271 76% 53%)",
  "hsl(199 89% 48%)",
  "hsl(24 95% 53%)",
  "hsl(160 84% 39%)",
  "hsl(330 81% 60%)",
  "hsl(47 96% 45%)",
  "hsl(191 91% 37%)",
  "hsl(280 65% 60%)",
];

type Metric = "count" | "value";

export function PackageTimelineChart({ months }: { months: TimelineMonth[] }) {
  const [metric, setMetric] = useState<Metric>("count");
  const [stacked, setStacked] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const packages = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of months) {
      for (const p of m.packages) {
        const k = p.pkg;
        totals.set(k, (totals.get(k) ?? 0) + p.count);
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name], i) => ({ name, color: PALETTE[i % PALETTE.length] }));
  }, [months]);

  const data = useMemo(() => {
    const asc = [...months].sort((a, b) => a.key.localeCompare(b.key));
    return asc.map((m) => {
      const row: Record<string, string | number> = { label: m.label };
      for (const p of packages) row[p.name] = 0;
      for (const p of m.packages) {
        if (!(p.pkg in row)) continue;
        row[p.pkg] = (Number(row[p.pkg]) || 0) + (metric === "count" ? p.count : p.total);
      }
      return row;
    });
  }, [months, packages, metric]);

  const visible = packages.filter((p) => !hidden.has(p.name));

  function toggle(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!months.length || !packages.length) return null;

  return (
    <Card className="card-elegant mt-4 border-0 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">مخطط زمني — مقارنة الباقات شهريًا</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={metric === "count" ? "default" : "outline"}
            className="h-8 rounded-xl"
            onClick={() => setMetric("count")}
          >
            عدد الكروت
          </Button>
          <Button
            size="sm"
            variant={metric === "value" ? "default" : "outline"}
            className="h-8 rounded-xl"
            onClick={() => setMetric("value")}
          >
            قيمة المبيعات
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl"
            onClick={() => setStacked((s) => !s)}
          >
            {stacked ? "أعمدة متجاورة" : "أعمدة متراكمة"}
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {packages.map((p) => {
          const off = hidden.has(p.name);
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => toggle(p.name)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                off ? "border-border/50 text-muted-foreground opacity-60" : "border-border font-semibold"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: off ? "hsl(var(--muted-foreground))" : p.color }}
              />
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="h-[320px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={60}
            />
            <YAxis
              orientation="right"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              width={60}
              tickFormatter={(v) => (metric === "count" ? String(v) : String(v))}
            />
            <Tooltip
              contentStyle={{
                direction: "rtl",
                fontSize: 12,
                borderRadius: 12,
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: any, name: any) => [
                metric === "count" ? `${value} كرت` : fmtMoney(Number(value) || 0),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11, direction: "rtl" }} />
            {visible.map((p) => (
              <Bar
                key={p.name}
                dataKey={p.name}
                name={p.name}
                fill={p.color}
                stackId={stacked ? "a" : undefined}
                radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                maxBarSize={stacked ? 38 : 22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        اضغط على اسم الباقة لإخفائها أو إظهارها في المخطط للمقارنة.
      </div>
    </Card>
  );
}
