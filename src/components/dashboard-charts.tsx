import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, LabelList, PieChart, Pie, Sector,
} from "recharts";
import { useState } from "react";
import { fmtMoney } from "@/lib/format";

type PkgRow = { network: string; pkg: string; total: number; sold: number; withdrawn: number; remaining: number; value: number; currency?: string };
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
  if (!data.length) {
    return <div className="text-center text-sm text-muted-foreground py-10">لا توجد بيانات.</div>;
  }

  const COLORS = {
    sold: "var(--primary)",
    withdrawn: "var(--success, var(--primary))",
    remaining: "var(--warning)",
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-4 mb-4 text-xs">
        <LegendChip color={COLORS.sold} label="المباع" />
        <LegendChip color={COLORS.withdrawn} label="المسحوب" />
        <LegendChip color={COLORS.remaining} label="المتبقي" />
      </div>

      <div
        className="flex flex-row gap-4 overflow-x-auto overflow-y-hidden pb-2 snap-x snap-mandatory"
        dir="rtl"
        style={{
          whiteSpace: "nowrap",
          WebkitOverflowScrolling: "touch",
          scrollSnapType: "x mandatory",
          touchAction: "pan-x",
        }}
      >
        {data.map((r, idx) => {
          const total = r.total || (r.sold + r.withdrawn + r.remaining);
          const slices = [
            { name: "المباع", value: r.sold, color: COLORS.sold },
            { name: "المسحوب", value: r.withdrawn, color: COLORS.withdrawn },
            { name: "المتبقي", value: r.remaining, color: COLORS.remaining },
          ];
          return (
            <div
              key={idx}
              className="shrink-0 snap-start rounded-2xl border border-border/60 bg-card/50 p-2 sm:p-3"
              style={{ width: 300, minWidth: 300, maxWidth: 300, whiteSpace: "normal", scrollSnapAlign: "start" }}
            >
              <div className="text-center mb-1">
                <div className="text-sm font-bold text-foreground truncate">{r.pkg}</div>
                <div className="text-[10px] text-muted-foreground truncate">{r.network}</div>
              </div>
              <div style={{ width: "100%", height: 140 }} dir="ltr">
                <ResponsiveContainer>
                  <PieChart>
                    <defs>
                      {slices.map((s, i) => (
                        <linearGradient key={i} id={`grad-pkg-${idx}-${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={55}

                      paddingAngle={2}
                      stroke="var(--background)"
                      strokeWidth={2}
                    >
                      {slices.map((_, i) => (
                        <Cell key={i} fill={`url(#grad-pkg-${idx}-${i})`} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0];
                        const pct = total ? Math.round((Number(p.value) / total) * 100) : 0;
                        return (
                          <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-lg text-xs" dir="rtl">
                            <div className="font-bold mb-1 text-foreground">{p.name}</div>
                            <div className="text-muted-foreground">
                              العدد: <span className="font-bold text-foreground">{p.value}</span> ({pct}%)
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                <MiniStat label="مباع" value={r.sold} color={COLORS.sold} />
                <MiniStat label="مسحوب" value={r.withdrawn} color={COLORS.withdrawn} />
                <MiniStat label="متبقي" value={r.remaining} color={COLORS.remaining} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-muted/40 py-1">
      <div className="font-bold text-foreground" style={{ color }}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

export function AgentsChart({ totals }: { totals: { withdrawn: number; sold: number; remaining: number } }) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const data = [
    { name: "المسحوب (لدى المناديب)", value: totals.withdrawn, color: "var(--primary)" },
    { name: "المباع", value: totals.sold, color: "var(--success, var(--primary))" },
    { name: "المتبقي", value: totals.remaining, color: "var(--warning)" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <div className="text-center text-sm text-muted-foreground py-10">لا توجد بيانات.</div>;
  }

  const renderActive = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6}
          startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-4 mb-3 text-xs">
        {data.map((d, i) => (
          <LegendChip key={i} color={d.color} label={`${d.name}: ${d.value}`} />
        ))}
      </div>

      <div style={{ width: "100%", height: 300 }} dir="ltr">
        <ResponsiveContainer>
          <PieChart>
            <defs>
              {data.map((d, i) => (
                <linearGradient key={i} id={`grad-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={d.color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
              activeIndex={activeIndex}
              activeShape={renderActive}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={`url(#grad-pie-${i})`} />
              ))}
              <LabelList
                dataKey="value"
                position="inside"
                style={{ fill: "#fff", fontSize: 12, fontWeight: 700 }}
                formatter={(v: any) => {
                  const n = Number(v);
                  if (!n) return "";
                  const pct = Math.round((n / total) * 100);
                  return `${n} (${pct}%)`;
                }}
              />
            </Pie>
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                const pct = Math.round((Number(p.value) / total) * 100);
                return (
                  <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-lg text-xs" dir="rtl">
                    <div className="font-bold mb-1 text-foreground">{p.name}</div>
                    <div className="text-muted-foreground">
                      العدد: <span className="font-bold text-foreground">{p.value}</span> ({pct}%)
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
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
