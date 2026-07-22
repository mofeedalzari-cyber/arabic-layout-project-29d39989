import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import {
  Search, BarChart3, Wifi, RefreshCw, Wallet, Receipt, Coins, Shapes, Network, Tag, Pencil,
} from "lucide-react";
import { displayPhone, fmtMoney } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { adminUpdateAgent } from "@/lib/admin-agents.functions";
import { Label } from "@/components/ui/label";


export const Route = createFileRoute("/app/agents")({ component: AgentsPage });

function AgentsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statsFor, setStatsFor] = useState<{ id: string; name: string; username: string } | null>(null);
  const [editFor, setEditFor] = useState<{ id: string; username: string; full_name: string | null; phone?: string | null } | null>(null);


  const { data: networks } = useQuery({
    queryKey: ["networks-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("networks").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("role", "agent");
      const ids = roles?.map((r) => r.user_id) ?? [];
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles")
        .select("id, username, full_name, phone, is_active, created_at, network_id").in("id", ids)
        .order("created_at", { ascending: false });

      const { data: salesData } = await supabase.from("sales").select("agent_id, price");
      const m = new Map<string, { count: number; total: number }>();
      salesData?.forEach((s) => { const cur = m.get(s.agent_id) ?? { count: 0, total: 0 }; cur.count++; cur.total += Number(s.price); m.set(s.agent_id, cur); });
      return (profs ?? []).map((p) => ({ ...p, sales: m.get(p.id) ?? { count: 0, total: 0 } }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("set_agent_active", { _agent_id: id, _active: active });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم التحديث"); qc.invalidateQueries({ queryKey: ["agents"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setNetwork = useMutation({
    mutationFn: async ({ id, networkId }: { id: string; networkId: string | null }) => {
      const { error } = await supabase.rpc("set_agent_network", { _agent_id: id, _network_id: networkId as string });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث الشبكة"); qc.invalidateQueries({ queryKey: ["agents"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = agents?.filter((a) => !q || a.username.toLowerCase().includes(q.toLowerCase()) || (a.full_name ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="الوكلاء" description="إدارة حسابات الوكلاء وعرض إحصائياتهم" />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-xl" />
      </div>
      <div className="grid gap-3">
        {filtered?.map((a) => (
          <Card key={a.id} className="card-elegant border-0 p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="h-11 w-11 rounded-full gradient-primary-bg flex items-center justify-center font-bold text-white shrink-0">
                {displayPhone((a as any).phone, a.username).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{a.full_name || displayPhone((a as any).phone, a.username)}</div>
                <div className="text-xs text-muted-foreground truncate" dir="ltr">{displayPhone((a as any).phone, a.username)} · {a.sales.count} مبيعة · {fmtMoney(a.sales.total)}</div>
              </div>
              <Button
                variant="outline" size="sm"
                className="hidden sm:inline-flex rounded-xl shrink-0"
                onClick={() => setStatsFor({ id: a.id, name: a.full_name || displayPhone((a as any).phone, a.username), username: a.username })}
              >
                <BarChart3 className="h-4 w-4 ml-1" />الإحصائيات
              </Button>
              <Button
                variant="outline" size="icon"
                className="hidden sm:inline-flex rounded-xl shrink-0 h-9 w-9"
                title="تعديل بيانات المندوب"
                onClick={() => setEditFor({ id: a.id, username: a.username, full_name: a.full_name, phone: (a as any).phone })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`hidden sm:inline text-[11px] font-semibold ${a.is_active ? "text-success" : "text-muted-foreground"}`}>
                  {a.is_active ? "مفعّل" : "موقوف"}
                </span>
                <Switch checked={a.is_active} onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })} />
              </div>

            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <Network className="h-4 w-4 text-primary shrink-0" />
                <select
                  value={a.network_id ?? ""}
                  onChange={(e) => setNetwork.mutate({ id: a.id, networkId: e.target.value || null })}
                  disabled={!!a.network_id}
                  className="rounded-xl border bg-background text-sm px-2 py-1.5 flex-1 min-w-0 disabled:opacity-100 disabled:cursor-not-allowed"
                  title={a.network_id ? "لا يمكن تغيير الشبكة بعد الانضمام" : undefined}
                >
                  {!a.network_id && <option value="">— اختر الشبكة —</option>}
                  {networks?.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 sm:hidden">
                <span className={`text-[11px] font-semibold ${a.is_active ? "text-success" : "text-muted-foreground"}`}>
                  {a.is_active ? "مفعّل" : "موقوف"}
                </span>
                <Button
                  variant="outline" size="sm" className="rounded-xl h-8"
                  onClick={() => setStatsFor({ id: a.id, name: a.full_name || displayPhone((a as any).phone, a.username), username: a.username })}
                >
                  <BarChart3 className="h-4 w-4 ml-1" />الإحصائيات
                </Button>
                <Button
                  variant="outline" size="icon" className="rounded-xl h-8 w-8"
                  onClick={() => setEditFor({ id: a.id, username: a.username, full_name: a.full_name, phone: (a as any).phone })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>

              </div>
            </div>
          </Card>
        ))}
        {filtered?.length === 0 && <div className="text-center py-16 text-muted-foreground">لا يوجد وكلاء.</div>}
      </div>

      <Dialog open={!!statsFor} onOpenChange={(o) => !o && setStatsFor(null)}>
        <DialogContent className="max-w-2xl rounded-3xl max-h-[92vh] overflow-y-auto p-0" dir="rtl">
          <DialogHeader className="sr-only"><DialogTitle>إحصائيات — {statsFor?.name}</DialogTitle></DialogHeader>
          {statsFor && <AgentStats agentId={statsFor.id} name={statsFor.name} username={statsFor.username} />}
        </DialogContent>
      </Dialog>

      <EditAgentDialog
        agent={editFor}
        onClose={() => setEditFor(null)}
        onSaved={() => { setEditFor(null); qc.invalidateQueries({ queryKey: ["agents"] }); }}
      />
    </>
  );
}

function EditAgentDialog({
  agent, onClose, onSaved,
}: {
  agent: { id: string; username: string; full_name: string | null; phone?: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(adminUpdateAgent);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setFullName(agent.full_name ?? "");
      setPhone(displayPhone(agent.phone, agent.username) === "—" ? "" : displayPhone(agent.phone, agent.username));
      setPassword("");
    }
  }, [agent?.id]);


  const submit = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      await updateFn({
        data: {
          agentId: agent.id,
          full_name: fullName,
          phone: phone,
          password: password ? password : null,
        },
      });
      toast.success("تم حفظ التعديلات");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات المندوب {displayPhone(agent?.phone, agent?.username)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>الاسم الكامل</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} dir="rtl" className="text-right rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>رقم الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="rtl" className="text-right rounded-xl" placeholder="7xxxxxxxx" />
          </div>
          <div className="space-y-1.5">
            <Label>كلمة السر الجديدة</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="rtl" className="text-right rounded-xl" placeholder="اتركها فارغة لعدم التغيير" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 rounded-xl" onClick={submit} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>إلغاء</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


type PkgRow = {
  package_id: string;
  package_name: string;
  network_id: string;
  network_name: string;
  currency: string;
  price: number;
  available: number;
  sold: number;
};

export function AgentStats({ agentId, name, username }: { agentId: string; name: string; username: string }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agent-stats-full", agentId],
    queryFn: async () => {
      const [cardsRes, salesRes, reqRes] = await Promise.all([
        supabase.from("cards")
          .select("id, status, package_id, network_id, assigned_to, sold_to, packages!inner(price, name), networks!inner(name, currency)")
          .or(`assigned_to.eq.${agentId},sold_to.eq.${agentId}`),
        supabase.from("sales")
          .select("id, price, package_id, package_name, network_id, network_name, sold_at")
          .eq("agent_id", agentId),
        supabase.from("card_requests")
          .select("id, network_id, network_name, total_value, paid_amount, status")
          .eq("agent_id", agentId).eq("status", "APPROVED"),
      ]);
      if (cardsRes.error) throw cardsRes.error;
      if (salesRes.error) throw salesRes.error;
      if (reqRes.error) throw reqRes.error;

      const cards = (cardsRes.data ?? []) as any[];
      const sales = salesRes.data ?? [];
      const requests = reqRes.data ?? [];

      const pkgMap = new Map<string, PkgRow>();
      for (const c of cards) {
        const key = c.package_id;
        const cur = pkgMap.get(key) ?? {
          package_id: c.package_id,
          package_name: c.packages?.name ?? "—",
          network_id: c.network_id,
          network_name: c.networks?.name ?? "—",
          currency: c.networks?.currency ?? "",
          price: Number(c.packages?.price ?? 0),
          available: 0, sold: 0,
        };
        if (c.status === "ASSIGNED" && c.assigned_to === agentId) cur.available++;
        if (c.status === "SOLD" && c.sold_to === agentId) cur.sold++;
        pkgMap.set(key, cur);
      }
      const byPkgBase = [...pkgMap.values()].sort((a, b) => (b.sold + b.available) - (a.sold + a.available));

      const soldValueByPkg = new Map<string, number>();
      const soldCountByPkg = new Map<string, number>();
      for (const s of sales) {
        soldValueByPkg.set(s.package_id, (soldValueByPkg.get(s.package_id) ?? 0) + Number(s.price));
        soldCountByPkg.set(s.package_id, (soldCountByPkg.get(s.package_id) ?? 0) + 1);
      }

      type Agg = { available: number; sold: number; availableValue: number; soldValue: number };
      const byCurrency = new Map<string, Agg>();
      const byNetworkMap = new Map<string, Agg & { network_id: string; name: string; currency: string }>();
      let totalAvailable = 0, totalSold = 0, totalAvailableValue = 0, totalSoldValue = 0;

      const byPkg = byPkgBase.map((p) => {
        const availValue = p.available * p.price;
        const soldValue = soldValueByPkg.get(p.package_id) ?? p.sold * p.price;
        const soldCount = soldCountByPkg.get(p.package_id) ?? p.sold;

        const cAgg = byCurrency.get(p.currency) ?? { available: 0, sold: 0, availableValue: 0, soldValue: 0 };
        cAgg.available += p.available; cAgg.sold += soldCount;
        cAgg.availableValue += availValue; cAgg.soldValue += soldValue;
        byCurrency.set(p.currency, cAgg);

        const nAgg = byNetworkMap.get(p.network_id) ?? { network_id: p.network_id, name: p.network_name, currency: p.currency, available: 0, sold: 0, availableValue: 0, soldValue: 0 };
        nAgg.available += p.available; nAgg.sold += soldCount;
        nAgg.availableValue += availValue; nAgg.soldValue += soldValue;
        byNetworkMap.set(p.network_id, nAgg);

        totalAvailable += p.available; totalSold += soldCount;
        totalAvailableValue += availValue; totalSoldValue += soldValue;

        return { ...p, soldCount, soldValue };
      });

      const debtByNet = new Map<string, { network_id: string; name: string; amount: number }>();
      let totalDebt = 0;
      for (const r of requests) {
        const remaining = Math.max(0, Number(r.total_value ?? 0) - Number(r.paid_amount ?? 0));
        if (remaining <= 0) continue;
        totalDebt += remaining;
        const cur = debtByNet.get(r.network_id) ?? { network_id: r.network_id, name: r.network_name ?? "—", amount: 0 };
        cur.amount += remaining;
        debtByNet.set(r.network_id, cur);
      }

      return {
        totals: {
          totalValue: totalAvailableValue + totalSoldValue,
          soldValue: totalSoldValue,
          availableValue: totalAvailableValue,
          available: totalAvailable, sold: totalSold,
        },
        byPkg,
        byCurrency: [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v })),
        byNetwork: [...byNetworkMap.values()],
        debt: { total: totalDebt, byNet: [...debtByNet.values()].sort((a, b) => b.amount - a.amount) },
      };
    },
  });

  const perNetwork = useMemo(() => data?.byNetwork ?? [], [data]);

  if (isLoading || !data) return <div className="py-16 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>;
  const t = data.totals;

  return (
    <div dir="rtl" className="bg-muted/30 rounded-3xl text-right">
      <div className="p-4 pb-3 flex items-center justify-between gap-3">
        <Button size="icon" variant="ghost" className="rounded-full h-9 w-9" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["agents"] }); }}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <div className="text-center flex-1">
          <div className="text-lg font-extrabold">لوحة الإحصائيات</div>
          <div className="text-xs text-muted-foreground">{name} <span className="opacity-60">· {displayPhone(null, username)}</span></div>
        </div>
        <div className="h-10 w-10 rounded-full gradient-primary-bg flex items-center justify-center text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-3 gap-2">
          <TopStat label="إجمالي القيمة" value={fmtMoney(t.totalValue)} tone="primary" />
          <TopStat label="قيمة المباع" value={fmtMoney(t.soldValue)} />
          <TopStat label="قيمة المتاح" value={fmtMoney(t.availableValue)} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {perNetwork.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground border-0 card-elegant text-sm">
            لا توجد بيانات لعرضها.
          </Card>
        )}

        {perNetwork.map((n) => {
          const netPkgs = data.byPkg.filter((p) => p.network_id === n.network_id);
          const debt = data.debt.byNet.find((d) => d.network_id === n.network_id);
          return (
            <div key={n.network_id} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">UP</div>
                <div className="text-sm font-extrabold">{n.name} — الإحصائيات</div>
              </div>

              <Card className="p-4 border-0 card-elegant">
                <SectionTitle icon={Wallet} title="إحصائيات المبالغ" />
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <Metric label="إجمالي القيمة" value={fmtMoney(n.availableValue + n.soldValue)} />
                  <Metric label="قيمة المباع" value={fmtMoney(n.soldValue)} />
                  <Metric label="قيمة المتاح" value={fmtMoney(n.availableValue)} />
                </div>
              </Card>

              <Card className="p-4 border-0 card-elegant">
                <SectionTitle icon={Receipt} title="الديون" />
                <div className="mt-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-2">
                    <span className="text-lg font-extrabold text-success">{fmtMoney(debt?.amount ?? 0)}</span>
                    <span className="text-xs text-muted-foreground">إجمالي الديون</span>
                  </div>
                </div>
                {(debt?.amount ?? 0) > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground mt-4 mb-2">تفصيل الديون حسب الشبكة:</div>
                    <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Wifi className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{n.name}</span>
                      </div>
                      <span className="rounded-full bg-success/10 text-success font-bold px-3 py-1 text-sm">{fmtMoney(debt!.amount)}</span>
                    </div>
                  </>
                )}
              </Card>

              <Card className="p-4 border-0 card-elegant">
                <SectionTitle icon={Coins} title="تفصيل حسب العملة" />
                <div className="mt-3 rounded-2xl bg-muted/40 p-3">
                  <div className="flex items-center justify-start gap-2 mb-2">
                    <span className="text-xs font-bold">{n.currency}</span>
                    <Coins className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniCol v={String(n.available + n.sold)} l="إجمالي" />
                    <MiniCol v={String(n.sold)} l="مباعة" />
                    <MiniCol v={String(n.available)} l="متاحة" />
                    <MiniCol v={fmtMoney(n.availableValue + n.soldValue)} l="قيمة إجمالية" />
                    <MiniCol v={fmtMoney(n.soldValue)} l="قيمة المباع" />
                    <MiniCol v={fmtMoney(n.availableValue)} l="قيمة المتاح" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 border-0 card-elegant">
                <SectionTitle icon={Shapes} title="المبيعات حسب الفئات" />
                <div className="mt-3 space-y-2">
                  {netPkgs.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">لا بيانات.</div>}
                  {netPkgs.map((p) => (
                    <div key={p.package_id} className="rounded-2xl bg-muted/40 p-3">
                      <div className="flex items-center justify-start gap-2 mb-2">
                        <span className="rounded-full bg-primary/10 text-primary text-[11px] font-bold px-2.5 py-1 truncate max-w-[70%]">{p.package_name}</span>
                        <Tag className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center">
                        <MiniCol v={String(p.available + p.soldCount)} l="إجمالي" />
                        <MiniCol v={String(p.available)} l="متاح" />
                        <MiniCol v={String(p.soldCount)} l="مباع" />
                        <MiniCol v={fmtMoney(p.soldValue)} l="قيمة المباع" />
                      </div>
                      <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        القيمة الاسمية: {n.currency} {fmtMoney(p.price)}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          );
        })}

        {perNetwork.length > 0 && (
          <Card className="p-4 border-0 card-elegant">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon={Network} title="الشبكات المرتبطة" />
              <span className="text-[11px] text-muted-foreground">العدد: {perNetwork.length}</span>
            </div>
            <div className="space-y-2">
              {perNetwork.map((n) => (
                <div key={n.network_id} className="rounded-2xl bg-muted/40 p-3">
                  <div className="flex items-center justify-start gap-2 mb-2">
                    <span className="font-bold text-sm">{n.name}</span>
                    <Wifi className="h-4 w-4 text-primary" />
                    <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-bold">{n.currency}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <MiniCol v={String(n.available + n.sold)} l="إجمالي" />
                    <MiniCol v={String(n.available)} l="متاح" />
                    <MiniCol v={String(n.sold)} l="مباع" />
                    <MiniCol v={fmtMoney(n.soldValue)} l="قيمة المباع" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function TopStat({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${tone === "primary" ? "gradient-primary-bg text-white" : "bg-card border border-border/50"}`}>
      <div className="text-base font-extrabold truncate">{value}</div>
      <div className={`text-[11px] mt-0.5 ${tone === "primary" ? "text-white/80" : "text-muted-foreground"}`}>{label}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center justify-start gap-2 text-sm font-bold">
      <span>{title}</span>
      <Icon className="h-4 w-4 text-primary" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-base font-extrabold truncate">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function MiniCol({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <div className="text-sm font-extrabold truncate">{v}</div>
      <div className="text-[10px] text-muted-foreground">{l}</div>
    </div>
  );
}
