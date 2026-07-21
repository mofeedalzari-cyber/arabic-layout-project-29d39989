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
            <TableView
              cols={["الشبكة", "مسحوب", "مباع/مستخدم", "قيمة المبيعات"]}
              rows={byNetwork.map((r) => [
                r.label,
                String(r.withdrawn),
                String(r.sold),
                `${fmtMoney(r.value)} ${r.currency ?? ""}`,
              ])}
              empty="لا توجد بيانات."
            />
          </Card>

          <Card className="p-4 border-0 card-elegant">
            <div className="flex items-center gap-2 mb-3">
              <PackageIcon className="h-4 w-4 text-primary" />
              <div className="font-semibold">تفاصيل حسب الفئة</div>
            </div>
            <TableView
              cols={["الفئة", "الشبكة", "السعر", "مسحوب", "مباع/مستخدم", "قيمة المبيعات"]}
              rows={byPackage.map((r) => [
                r.label,
                r.sub ?? "—",
                r.price != null ? `${fmtMoney(r.price)} ${r.currency ?? ""}` : "—",
                String(r.withdrawn),
                String(r.sold),
                `${fmtMoney(r.value)} ${r.currency ?? ""}`,
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

function TableView({ cols, rows, empty }: { cols: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <div className="text-center text-sm text-muted-foreground py-4">{empty}</div>;
  return (
    <>
      <div className="md:hidden space-y-2">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="rounded-xl bg-muted/40 p-3">
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 first:pt-0 last:border-0 last:pb-0">
                <span className="shrink-0 text-[11px] text-muted-foreground">{cols[cellIndex]}</span>
                <span className="min-w-0 text-left text-sm font-semibold leading-relaxed [overflow-wrap:anywhere]">{cell}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        className="hidden md:block h-scroll -mx-4 px-4 pb-2 md:mx-0 md:px-0 md:pb-0"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
      >
        <table className="text-sm min-w-max w-max md:min-w-full md:w-full">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              {cols.map((c) => <th key={c} className="text-right font-medium px-2 py-1.5 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/50">
                {r.map((cell, j) => <td key={j} className="px-2 py-2 whitespace-nowrap">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function printAgentReport(a: PrintArgs) {
  const now = new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });



  const initials = esc(
    (a.agentLabel || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("")
  );

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>حساب المندوب — ${esc(a.agentLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 12mm 12mm 15mm 12mm; }
  :root {
    --brand:#0ea884; --brand-2:#0891b2; --brand-3:#065f46;
    --ink:#0f172a; --muted:#64748b; --line:#d1d5db; --soft:#fafafa;
    --header-bg:#f3f4f6;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#fff; }
  body {
    font-family: "Cairo", "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif;
    color: var(--ink); font-size: 13px; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    direction: rtl;
  }
  .page { width: 100%; margin: 0 auto; }
  .head { padding: 6px 0 12px; border-bottom: 2px solid var(--brand); margin-bottom: 16px; }
  .head-row { display:flex; justify-content:space-between; align-items:center; gap:16px; }
  .brand-wrap { display:flex; align-items:center; gap:12px; }
  .logo { width:48px; height:48px; border-radius:12px; background: linear-gradient(135deg, var(--brand), var(--brand-2)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:22px; }
  .brand-name { font-weight:900; font-size:18px; color: var(--ink); }
  .brand-sub { font-size:11.5px; color: var(--muted); margin-top:2px; }
  .doc-meta { text-align:left; font-size:11.5px; color: var(--muted); }
  .doc-badge { display:inline-block; background: var(--header-bg); border:1px solid var(--line); color: var(--ink); border-radius: 6px; padding:3px 10px; font-weight:700; font-size:11px; margin-bottom:4px; }
  .agent { display:flex; align-items:center; gap:14px; background:#fff; border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-bottom:16px; break-inside: avoid; }
  .avatar { width:48px; height:48px; border-radius:50%; background: linear-gradient(135deg, var(--brand), var(--brand-3)); color:#fff; font-weight:900; font-size:18px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .agent-info h1 { font-size:16px; margin:0 0 2px; font-weight:800; }
  .agent-info .m { color: var(--muted); font-size:12px; }
  .pill { margin-inline-start:auto; background: var(--header-bg); color: var(--brand-3); border:1px solid var(--line); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:800; }
  .stats { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin: 0 0 20px; }
  .stat { border:1px solid var(--line); border-radius:8px; padding:10px 12px; background:#fff; break-inside: avoid; }
  .stat .l { font-size:11px; color: var(--muted); font-weight:600; }
  .stat .v { font-size:16px; font-weight:900; margin-top:4px; color: var(--ink); font-variant-numeric: tabular-nums; }
  h2 { font-size:14px; margin: 24px 0 8px; padding: 6px 10px; color:#fff; font-weight:800; background: linear-gradient(135deg, var(--brand), var(--brand-2)); border-radius: 6px; display:flex; align-items:center; gap:8px; page-break-after: avoid; }
  .tbl-wrap { border:1px solid var(--line); border-radius:6px; overflow:hidden; margin-bottom:24px; break-inside: avoid; }
  table { width:100%; border-collapse: collapse; font-size:12.5px; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  thead th { background: var(--header-bg); color: var(--ink); font-weight:700; padding:10px 8px; text-align:right; border:1px solid var(--line); font-size:13px; height:40px; }
  tbody td { padding:10px 8px; text-align:right; border:1px solid var(--line); height:40px; word-break: break-word; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: var(--soft); }
  tbody tr:nth-child(odd) td { background: #ffffff; }
  td.num, th.num { text-align:center; font-variant-numeric: tabular-nums; width:36px; }
  .money { font-weight:700; color: var(--brand-3); font-variant-numeric: tabular-nums; }
  .idx { display:inline-block; min-width:22px; padding:1px 6px; border-radius:4px; background:var(--header-bg); color:var(--ink); font-weight:700; font-size:11px; }
  .empty { text-align:center; color: var(--muted); padding:14px 0; font-style:italic; }
  .footer { margin-top:24px; padding-top:10px; border-top: 1px solid var(--line); display:flex; justify-content:space-between; align-items:center; font-size:11px; color: var(--muted); }
  .footer .sig { color: var(--brand); font-weight:900; }
  @media print { body { background:#fff !important; } .noprint { display:none !important; } }
</style></head><body>
<div class="page">
  <div class="head">
    <div class="head-row">
      <div class="brand-wrap">
        <div class="logo">📶</div>
        <div>
          <div class="brand-name">كرتي</div>
          <div class="brand-sub">نظام إدارة الشبكات والمناديب</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-badge">تقرير مالي</div>
        <div>📅 ${esc(now)}</div>
      </div>
    </div>
  </div>

  <div class="agent">
    <div class="avatar">${initials || "؟"}</div>
    <div class="agent-info">
      <h1>${esc(a.agentLabel)}</h1>
      <div class="m">الشبكة: <b>${esc(a.networkFilter)}</b></div>
    </div>
    <div class="pill">كشف حساب مندوب</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="l">إجمالي المسحوب</div><div class="v">${a.withdrawn}</div></div>
    <div class="stat blue"><div class="l">مباع / مستخدم</div><div class="v">${a.sold}</div></div>
    <div class="stat gold"><div class="l">قيمة المبيعات</div><div class="v">${fmtMoney(a.salesValue)}</div></div>
    <div class="stat rose"><div class="l">فئات / شبكات</div><div class="v">${a.distinctPackages} / ${a.networksCount}</div></div>
  </div>

  <h2>تفاصيل حسب الشبكة</h2>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th class="num">#</th><th>الشبكة</th>
        <th class="num">مسحوب</th><th class="num">مباع</th>
        <th>قيمة المبيعات</th>
      </tr></thead>
      <tbody>${
        a.byNetwork.map((r, i) => `
          <tr>
            <td class="num"><span class="idx">${i + 1}</span></td>
            <td><b>${esc(r.label)}</b></td>
            <td class="num">${r.withdrawn}</td>
            <td class="num">${r.sold}</td>
            <td class="money">${fmtMoney(r.value)} <span style="color:var(--muted);font-weight:600">${esc(r.currency ?? "")}</span></td>
          </tr>`).join("") ||
        `<tr><td colspan="5" class="empty">لا توجد بيانات</td></tr>`
      }</tbody>
    </table>
  </div>

  <h2>تفاصيل حسب الفئة</h2>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th class="num">#</th><th>الفئة</th><th>الشبكة</th>
        <th>السعر</th>
        <th class="num">مسحوب</th><th class="num">مباع</th>
        <th>قيمة المبيعات</th>
      </tr></thead>
      <tbody>${
        a.byPackage.map((r, i) => `
          <tr>
            <td class="num"><span class="idx">${i + 1}</span></td>
            <td><b>${esc(r.label)}</b></td>
            <td>${esc(r.sub ?? "—")}</td>
            <td>${r.price != null ? `${fmtMoney(r.price)} <span style="color:var(--muted);font-weight:600">${esc(r.currency ?? "")}</span>` : "—"}</td>
            <td class="num">${r.withdrawn}</td>
            <td class="num">${r.sold}</td>
            <td class="money">${fmtMoney(r.value)} <span style="color:var(--muted);font-weight:600">${esc(r.currency ?? "")}</span></td>
          </tr>`).join("") ||
        `<tr><td colspan="7" class="empty">لا توجد بيانات</td></tr>`
      }</tbody>
    </table>
  </div>

  <h2>سجل العمليات</h2>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th class="num">#</th><th>رقم العملية</th>
        <th>الفئة</th><th>الشبكة</th>
        <th>القيمة</th><th>تاريخ البيع</th>
      </tr></thead>
      <tbody>${
        a.sales.map((s, i) => `
          <tr>
            <td class="num"><span class="idx">${i + 1}</span></td>
            <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:6px;font-size:11px">${esc(s.transaction_no ?? "—")}</code></td>
            <td><b>${esc(s.package_name)}</b></td>
            <td>${esc(s.network_name)}</td>
            <td class="money">${fmtMoney(Number(s.price))} <span style="color:var(--muted);font-weight:600">${esc(a.netMap.get(s.network_id)?.currency ?? "")}</span></td>
            <td style="color:var(--muted);font-size:11.5px">${new Date(s.sold_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td>
          </tr>`).join("") ||
        `<tr><td colspan="6" class="empty">لا توجد عمليات</td></tr>`
      }</tbody>
    </table>
  </div>

  <div class="footer">
    <div>© جميع الحقوق محفوظة</div>
    <div>برمجة وتصميم <span class="sig">مفيد الزري</span> · 778492884</div>
  </div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 350); };</script>
</body></html>`;

  const { sharePdfOrPrint } = await import("@/lib/native-pdf");
  await sharePdfOrPrint({
    html,
    filename: `كشف_حساب_${a.agentLabel}`,
    dialogTitle: "طباعة أو مشاركة كشف الحساب",
  });
}
