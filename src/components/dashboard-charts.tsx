import {
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
  Sector,
} from "recharts";
import { useState } from "react";
import { fmtMoney } from "@/lib/format";

type PkgRow = {
  network: string;
  pkg: string;
  total: number;
  sold: number;
  withdrawn: number;
  remaining: number;
  value: number;
  currency?: string;
};

const COLORS = {
  sold: "var(--primary)",
  withdrawn: "var(--success, var(--primary))",
  remaining: "var(--warning)",
};

export function PackagesChart({ data }: { data: PkgRow[] }) {
  if (!data.length) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">
        لا توجد بيانات.
      </div>
    );
  }

  return (
    <div dir="rtl">
      {/* أسطورة محسّنة */}
      <div className="flex flex-wrap justify-center gap-6 mb-6 text-xs">
        <LegendChip color={COLORS.sold} label="المباع" />
        <LegendChip color={COLORS.withdrawn} label="المسحوب" />
        <LegendChip color={COLORS.remaining} label="المتبقي" />
      </div>

      {/* شبكة البطاقات مع تحسينات التصميم */}
      <div
        className="
          grid 
          grid-cols-1 
          sm:grid-cols-2 
          xl:grid-cols-3 
          gap-5
          w-full
        "
      >
        {data.map((r, idx) => {
          const total =
            r.total || r.sold + r.withdrawn + r.remaining;

          const slices = [
            { name: "المباع", value: r.sold, color: COLORS.sold },
            { name: "المسحوب", value: r.withdrawn, color: COLORS.withdrawn },
            { name: "المتبقي", value: r.remaining, color: COLORS.remaining },
          ];

          return (
            <div
              key={idx}
              className="
                w-full
                rounded-2xl
                border border-border/50
                bg-card/80
                p-4
                shadow-sm
                hover:shadow-md
                transition-shadow
                duration-300
              "
            >
              {/* عنوان البطاقة */}
              <div className="text-center mb-3">
                <div className="text-sm font-bold truncate text-foreground">
                  {r.pkg}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {r.network}
                </div>
              </div>

              {/* الرسم البياني الدائري - ارتفاع متجاوب */}
              <div className="w-full aspect-square max-h-[180px] mx-auto" dir="ltr">
                <ResponsiveContainer>
                  <PieChart>
                    <defs>
                      {slices.map((s, i) => (
                        <linearGradient
                          key={i}
                          id={`pkg-gradient-${idx}-${i}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={s.color} stopOpacity={0.5} />
                        </linearGradient>
                      ))}
                    </defs>

                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="35%"
                      outerRadius="60%"
                      paddingAngle={2}
                      stroke="var(--background)"
                      strokeWidth={2}
                    >
                      {slices.map((_, i) => (
                        <Cell key={i} fill={`url(#pkg-gradient-${idx}-${i})`} />
                      ))}
                    </Pie>

                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0];
                        const pct = total ? Math.round((Number(p.value) / total) * 100) : 0;

                        return (
                          <div
                            className="
                              rounded-xl
                              border border-border/50
                              bg-background/90
                              backdrop-blur-sm
                              px-4
                              py-2.5
                              shadow-lg
                              text-xs
                              space-y-1
                              min-w-[120px]
                            "
                            dir="rtl"
                          >
                            <div className="font-bold text-foreground">{p.name}</div>
                            <div className="text-muted-foreground flex items-center gap-1">
                              <span>العدد:</span>
                              <b className="text-foreground">{p.value}</b>
                              <span className="text-muted-foreground/70">({pct}%)</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* إحصائيات صغرى محسّنة */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <MiniStat label="مباع" value={r.sold} color={COLORS.sold} />
                <MiniStat label="مسحوب" value={r.withdrawn} color={COLORS.withdrawn} />
                <MiniStat label="متبقي" value={r.remaining} color={COLORS.remaining} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- المكونات المساعدة (لم تتغير) ---

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const iconMap: Record<string, string> = {
    مباع: "🟢",
    مسحوب: "🔵",
    متبقي: "🟠",
  };

  return (
    <div
      className="
        rounded-xl
        bg-muted/30
        py-2
        px-1
        text-center
        border border-border/30
        transition-colors
        hover:bg-muted/50
      "
    >
      <div className="flex items-center justify-center gap-1 text-sm font-bold" style={{ color }}>
        <span className="text-base">{iconMap[label] || "•"}</span>
        <span>{value}</span>
      </div>
      <div className="text-[11px] text-muted-foreground/80 mt-0.5">{label}</div>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span
        className="h-3 w-3 rounded-full border border-border/30"
        style={{ background: color }}
      />
      <span className="text-muted-foreground font-medium">{label}</span>
    </div>
  );
}
