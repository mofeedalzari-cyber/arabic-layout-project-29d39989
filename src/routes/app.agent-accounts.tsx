import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { Wifi, Package as PackageIcon, ShoppingCart, DollarSign, Layers, Clock, Printer } from "lucide-react";

export const Route = createFileRoute("/app/agent-accounts")({ component: AgentAccountsPage });

function AgentAccountsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;

  const [networkId, setNetworkId] = useState<string>("all");
  const [agentId, setAgentId] = useState<string>("");

  const { data: networks } = useQuery({
    queryKey: ["aa-networks"],
    queryFn: async () => (await supabase.from("networks").select("id, name, currency").order("name")).data ?? [],
  });

  const { data: agents } = useQuery({
    queryKey: ["aa-agents"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
      const ids = roles?.map((r) => r.user_id) ?? [];
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles")
        .select("id, username, full_name").in("id", ids).order("full_name");
      return data ?? [];
    },
  });

  const { data: packages } = useQuery({
    queryKey: ["aa-packages"],
    queryFn: async () => (await supabase.from("packages").select("id, name, price, network_id")).data ?? [],
  });

  const { data: cards } = useQuery({
    queryKey: ["aa-cards", agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data } = await supabase.from("cards")
        .select("id, status, package_id, network_id, assigned_to")
        .eq("assigned_to", agentId);
      return data ?? [];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["aa-sales", agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data } = await supabase.from("sales")
        .select("id, transaction_no, package_id, package_name, network_id, network_name, price, sold_at")
        .eq("agent_id", agentId).order("sold_at", { ascending: false });
      return data ?? [];
    },
  });

  const netMap = useMemo(() => new Map(networks?.map((n) => [n.id, n]) ?? []), [networks]);
  const pkgMap = useMemo(() => new Map(packages?.map((p) => [p.id, p]) ?? []), [packages]);

  const filteredCards = useMemo(
    () => (cards ?? []).filter((c) => networkId === "all" || c.network_id === networkId),
    [cards, networkId]
  );
  const filteredSales = useMemo(
    () => (sales ?? []).filter((s) => networkId === "all" || s.network_id === networkId),
    [sales, networkId]
  );

  const agent = agents?.find((a) => a.id === agentId);
  const agentLabel = agent ? `${agent.full_name || agent.username} — ${agent.username}` : "";

  // Totals
  const withdrawn = filteredCards.filter((c) => c.status === "ASSIGNED").length;
  const sold = filteredSales.length;
  const salesValue = filteredSales.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const distinctPackages = new Set([
    ...filteredCards.map((c) => c.package_id),
    ...filteredSales.map((s) => s.package_id),
  ]);
  const networksCount = new Set([
    ...filteredCards.map((c) => c.network_id),
    ...filteredSales.map((s) => s.network_id),
  ]).size;

  // Group by network
  type Row = { key: string; label: string; sub?: string; currency?: string; withdrawn: number; sold: number; value: number };
  const byNetwork: Row[] = useMemo(() => {
    const m = new Map<string, Row>();
    for (const c of filteredCards) {
      const net = netMap.get(c.network_id);
      const cur = m.get(c.network_id) ?? { key: c.network_id, label: net?.name ?? "—", currency: net?.currency, withdrawn: 0, sold: 0, value: 0 };
      if (c.status === "ASSIGNED") cur.withdrawn++;
      m.set(c.network_id, cur);
    }
    for (const s of filteredSales) {
      const cur = m.get(s.network_id) ?? { key: s.network_id, label: s.network_name, currency: netMap.get(s.network_id)?.currency, withdrawn: 0, sold: 0, value: 0 };
      cur.sold++;
      cur.value += Number(s.price || 0);
      m.set(s.network_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value);
  }, [filteredCards, filteredSales, netMap]);

  // Group by package
  const byPackage: (Row & { price?: number })[] = useMemo(() => {
    const m = new Map<string, Row & { price?: number }>();
    for (const c of filteredCards) {
      const pkg = pkgMap.get(c.package_id);
      const net = netMap.get(c.network_id);
      const cur = m.get(c.package_id) ?? {
        key: c.package_id, label: pkg?.name ?? "—", sub: net?.name, currency: net?.currency,
        price: pkg ? Number(pkg.price) : undefined, withdrawn: 0, sold: 0, value: 0,
      };
      if (c.status === "ASSIGNED") cur.withdrawn++;
      m.set(c.package_id, cur);
    }
    for (const s of filteredSales) {
      const pkg = pkgMap.get(s.package_id);
      const cur = m.get(s.package_id) ?? {
        key: s.package_id, label: s.package_name, sub: s.network_name, currency: netMap.get(s.network_id)?.currency,
        price: pkg ? Number(pkg.price) : Number(s.price), withdrawn: 0, sold: 0, value: 0,
      };
      cur.sold++;
      cur.value += Number(s.price || 0);
      m.set(s.package_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value);
  }, [filteredCards, filteredSales, pkgMap, netMap]);

  return (
    <>
      <PageHeader title="حسابات المناديب" description="عرض تفصيلي لحساب كل مندوب حسب الشبكة والفئة" />

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div>
          <Label className="text-xs mb-1.5 block">الشبكة</Label>
          <Select value={networkId} onValueChange={setNetworkId}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الشبكات</SelectItem>
              {networks?.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">المندوب</Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {(a.full_name || a.username)} ({a.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!agentId ? (
        <Card className="p-8 text-center text-muted-foreground border-0 card-elegant">
          اختر مندوبًا لعرض حسابه.
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-4 border-0 card-elegant">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground mb-1">بيانات المندوب</div>
                <div className="text-lg font-bold [overflow-wrap:anywhere]">{agentLabel}</div>
              </div>
              <Button
                onClick={() => printAgentReport({
                  agentLabel, networkFilter: networkId === "all" ? "كل الشبكات" : (netMap.get(networkId)?.name ?? ""),
                  withdrawn, sold, salesValue, distinctPackages: distinctPackages.size, networksCount,
                  byNetwork, byPackage, sales: filteredSales, netMap,
                })}
                className="shrink-0 rounded-xl gradient-primary-bg text-white"
                size="sm"
              >
                <Printer className="h-4 w-4 ml-1" />
                طباعة PDF
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat icon={PackageIcon} label="مسحوب" value={String(withdrawn)} />
              <Stat icon={ShoppingCart} label="مباع / مستخدم" value={String(sold)} />
              <Stat icon={DollarSign} label="قيمة المبيعات" value={fmtMoney(salesValue)} />
              <Stat icon={Layers} label="فئات مختلفة" value={String(distinctPackages.size)} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-3">
              شبكات: {networksCount} • فئات: {distinctPackages.size}
            </div>
          </Card>

          <Card className="p-4 border-0 card-elegant">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="h-4 w-4 text-primary" />
              <div className="font-semibold">تفاصيل حسب الشبكة</div>
            </div>
            <StyledTable
              cols={["الشبكة", "مسحوب", "مباع/مستخدم", "قيمة المبيعات"]}
              rows={byNetwork.map((r) => [
                { text: r.label },
                { text: String(r.withdrawn), tone: "muted", align: "center" },
                { text: String(r.sold), tone: "warning", align: "center" },
                { text: fmtMoney(r.value), tone: "primary", align: "center" },
              ])}
              empty="لا توجد بيانات."
            />
          </Card>

          <Card className="p-4 border-0 card-elegant">
            <div className="flex items-center gap-2 mb-3">
              <PackageIcon className="h-4 w-4 text-primary" />
              <div className="font-semibold">تفاصيل حسب الفئة</div>
            </div>
            <StyledTable
              cols={["الفئة", "الشبكة", "السعر", "مسحوب", "مباع/مستخدم", "قيمة المبيعات"]}
              rows={byPackage.map((r) => [
                { text: r.label },
                { text: r.sub ?? "—" },
                r.price != null
                  ? { text: fmtMoney(r.price), badge: r.currency ?? undefined, align: "center" }
                  : { text: "—", align: "center" },
                { text: String(r.withdrawn), tone: "muted", align: "center" },
                { text: String(r.sold), tone: "warning", align: "center" },
                { text: fmtMoney(r.value), tone: "primary", align: "center" },
              ])}
              empty="لا توجد بيانات."
            />
          </Card>

          <Card className="p-4 border-0 card-elegant">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary" />
              <div className="font-semibold">آخر العمليات</div>
            </div>
            {filteredSales.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">لا توجد عمليات.</div>
            ) : (
              <div className="space-y-2">
                {filteredSales.slice(0, 20).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{s.package_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {s.network_name} · {new Date(s.sold_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </div>
                    <div className="text-sm font-bold shrink-0">
                      {fmtMoney(Number(s.price))} {netMap.get(s.network_id)?.currency ?? ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-lg font-extrabold mt-1">{value}</div>
    </div>
  );
}

type Cell = {
  text: string;
  tone?: "muted" | "warning" | "primary" | "success";
  badge?: string;
  align?: "start" | "center" | "end";
};

function toneClass(tone?: Cell["tone"]) {
  switch (tone) {
    case "primary": return "text-primary";
    case "warning": return "text-warning";
    case "success": return "text-success";
    case "muted": return "text-muted-foreground";
    default: return "text-foreground";
  }
}

function CellView({ c }: { c: Cell }) {
  const align = c.align === "center" ? "text-center" : c.align === "end" ? "text-left" : "text-right";
  return (
    <div className={`inline-flex items-center gap-1.5 font-semibold ${toneClass(c.tone)} ${align}`}>
      {c.badge && (
        <span className="text-[10px] font-bold rounded-md bg-muted/70 text-muted-foreground px-1.5 py-0.5">
          {c.badge}
        </span>
      )}
      <span className="[overflow-wrap:anywhere]">{c.text}</span>
    </div>
  );
}

function StyledTable({ cols, rows, empty }: { cols: string[]; rows: Cell[][]; empty: string }) {
  if (rows.length === 0) return <div className="text-center text-sm text-muted-foreground py-4">{empty}</div>;
  return (
    <div
      className="h-scroll -mx-4 px-4 pb-2 md:mx-0 md:px-0 md:pb-0 overflow-x-auto"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
    >
      <table dir="rtl" className="text-sm min-w-max w-max md:min-w-full md:w-full">
        <thead>
          <tr className="text-[11px] text-muted-foreground border-b border-border/50">
            {cols.map((c, i) => (
              <th
                key={c}
                className={`font-medium px-3 py-2 whitespace-nowrap ${i === 0 ? "text-right" : "text-center"}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/50">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2.5 whitespace-nowrap ${j === 0 ? "text-right" : "text-center"}`}
                >
                  <CellView c={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PrintArgs = {
  agentLabel: string;
  networkFilter: string;
  withdrawn: number;
  sold: number;
  salesValue: number;
  distinctPackages: number;
  networksCount: number;
  byNetwork: { key: string; label: string; currency?: string; withdrawn: number; sold: number; value: number }[];
  byPackage: { key: string; label: string; sub?: string; currency?: string; price?: number; withdrawn: number; sold: number; value: number }[];
  sales: { id: string; transaction_no?: string | null; package_name: string; network_name: string; network_id: string; price: number | string; sold_at: string }[];
  netMap: Map<string, { currency?: string | null }>;
};


async function printAgentReport(a: PrintArgs) {
  const { exportToPDF } = await import("@/lib/dashboard-export");

  const summary = [
    { label: "المندوب", value: a.agentLabel },
    { label: "الشبكة", value: a.networkFilter },
    { label: "إجمالي المسحوب", value: a.withdrawn },
    { label: "مباع / مستخدم", value: a.sold },
    { label: "قيمة المبيعات", value: fmtMoney(a.salesValue) },
    { label: "فئات / شبكات", value: `${a.distinctPackages} / ${a.networksCount}` },
  ];

  const sections = [
    {
      title: "تفاصيل حسب الشبكة",
      cols: ["الشبكة", "مسحوب", "مباع", "قيمة المبيعات"],
      rows: a.byNetwork.map((r) => [
        r.label,
        r.withdrawn,
        r.sold,
        `${fmtMoney(r.value)} ${r.currency ?? ""}`.trim(),
      ]),
    },
    {
      title: "تفاصيل حسب الفئة",
      cols: ["الفئة", "الشبكة", "السعر", "مسحوب", "مباع", "قيمة المبيعات"],
      rows: a.byPackage.map((r) => [
        r.label,
        r.sub ?? "—",
        r.price != null ? `${fmtMoney(r.price)} ${r.currency ?? ""}`.trim() : "—",
        r.withdrawn,
        r.sold,
        `${fmtMoney(r.value)} ${r.currency ?? ""}`.trim(),
      ]),
    },
    {
      title: "سجل العمليات",
      cols: ["رقم العملية", "الفئة", "الشبكة", "القيمة", "تاريخ البيع"],
      rows: a.sales.map((s) => [
        s.transaction_no ?? "—",
        s.package_name,
        s.network_name,
        `${fmtMoney(Number(s.price))} ${a.netMap.get(s.network_id)?.currency ?? ""}`.trim(),
        new Date(s.sold_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }),
      ]),
    },
  ];

  await exportToPDF(`كشف_حساب_${a.agentLabel}`, summary, sections, {
    reportName: `كشف حساب المندوب — ${a.agentLabel}`,
    branch: a.networkFilter,
  });
}
