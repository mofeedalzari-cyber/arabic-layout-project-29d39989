import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, LabelList, PieChart, Pie, Sector,
} from "recharts";
import { useState } from "react";
import { fmtMoney } from "@/lib/format";

type PkgRow = { network: string; pkg: string; total: number; sold: number; remaining: number; value: number; currency?: string };
type AgentRow = { agent: string; pkg: string; holding: number; price: number; currency?: string };

// ألوان معتمدة على tokens التصميم (HSL) — تعمل مع الوضع الفاتح والداكن
const C = {
  sold: "var(--primary)",
  remaining: "var(--warning)",
  agent: "var(--primary)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-lg text-xs" dir="rtl">
      <div className="font-bold mb-1 text-foreground">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold text-foreground">{fmtMoney(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function PackagesChart({ data }: { data: PkgRow[] }) {
  const chartData = data.map((r) => ({
    name: `${r.pkg}`,
    network: r.network,
    "المباع": r.sold,
    "المتبقي": r.remaining,
  }));

  if (!chartData.length) {
    return <div className="text-center text-sm text-muted-foreground py-10">لا توجد بيانات.</div>;
  }

  const height = Math.max(220, Math.min(chartData.length * 42 + 40, 520));

  return (
    <>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <LegendChip color={C.sold} label="المباع" />
        <LegendChip color={C.remaining} label="المتبقي" />
      </div>

      <div style={{ width: "100%", height }} dir="ltr">
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
            barCategoryGap={12}
          >
            <defs>
              <linearGradient id="grad-sold" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="grad-rem" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke={C.axis} fontSize={11} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              stroke={C.axis}
              fontSize={11}
              width={90}
              tickLine={false}
              axisLine={false}
              orientation="right"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.35 }} />
            <Bar dataKey="المباع" stackId="a" fill="url(#grad-sold)" radius={[8, 0, 0, 8]}>
              <LabelList dataKey="المباع" position="insideRight" style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} formatter={(v: any) => (Number(v) > 0 ? v : "")} />
            </Bar>
            <Bar dataKey="المتبقي" stackId="a" fill="url(#grad-rem)" radius={[0, 8, 8, 0]}>
              <LabelList dataKey="المتبقي" position="insideRight" style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} formatter={(v: any) => (Number(v) > 0 ? v : "")} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function AgentsChart({ data }: { data: AgentRow[] }) {
  // نجمع لكل مندوب إجمالي الكروت التي بحوزته (كل الباقات)
  const agg = new Map<string, number>();
  for (const r of data) agg.set(r.agent, (agg.get(r.agent) ?? 0) + r.holding);
  const chartData = [...agg.entries()]
    .map(([agent, holding]) => ({ name: agent, "لديه": holding }))
    .sort((a, b) => b["لديه"] - a["لديه"])
    .slice(0, 8);

  if (!chartData.length) {
    return <div className="text-center text-sm text-muted-foreground py-10">لا توجد كروت مسحوبة حاليًا.</div>;
  }

  const max = Math.max(...chartData.map((d) => d["لديه"]));

  return (
    <>
      <div className="flex items-center gap-4 mb-3 text-xs">
        <LegendChip color={C.agent} label="الكروت المسحوبة" />
      </div>

      <div style={{ width: "100%", height: Math.max(220, chartData.length * 44 + 30) }} dir="ltr">
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
            barCategoryGap={10}
          >
            <defs>
              <linearGradient id="grad-agent" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke={C.axis} fontSize={11} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              stroke={C.axis}
              fontSize={11}
              width={100}
              tickLine={false}
              axisLine={false}
              orientation="right"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.35 }} />
            <Bar dataKey="لديه" fill="url(#grad-agent)" radius={[8, 8, 8, 8]}>
              {chartData.map((d, i) => (
                <Cell key={i} fillOpacity={0.55 + 0.45 * (d["لديه"] / max)} />
              ))}
              <LabelList dataKey="لديه" position="insideRight" style={{ fill: "#fff", fontSize: 11, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
