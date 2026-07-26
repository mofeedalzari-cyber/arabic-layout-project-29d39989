import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, displayPhone, fmtArabicDateTime } from "@/lib/format";
import { useState } from "react";
import { ShieldCheck, Wifi, Users, Package as PkgIcon, CreditCard, Search } from "lucide-react";

export const Route = createFileRoute("/app/superadmin")({ component: SuperAdminPage });

function SuperAdminPage() {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role !== "superadmin") return <Navigate to="/app" />;

  const stats = useQuery({
    queryKey: ["sa-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_stats");
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  const networks = useQuery({
    queryKey: ["sa-networks"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_networks");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const agents = useQuery({
    queryKey: ["sa-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_agents");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const packages = useQuery({
    queryKey: ["sa-packages"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_packages");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [cardsFilter, setCardsFilter] = useState<{ network_id?: string; status?: string; search?: string }>({});
  const cards = useQuery({
    queryKey: ["sa-cards", cardsFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_cards", {
        _network_id: cardsFilter.network_id ?? null,
        _package_id: null,
        _status: cardsFilter.status ?? null,
        _search: cardsFilter.search ?? null,
        _limit: 1000,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const s = stats.data ?? {};

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader title="مدير التطبيق العام" description="عرض شامل لكل الشبكات والمناديب والباقات والكروت." />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الشبكات" value={s.networks ?? 0} sub={`نشطة: ${s.active_networks ?? 0}`} icon={<Wifi className="h-5 w-5" />} />
        <StatCard label="المناديب" value={s.agents ?? 0} sub={`مدراء الشبكات: ${s.admins ?? 0}`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="الباقات" value={s.packages ?? 0} sub={`كروت: ${s.total_cards ?? 0}`} icon={<PkgIcon className="h-5 w-5" />} />
        <StatCard label="المبيعات" value={fmtMoney(Number(s.sold_value ?? 0))} sub={`مباع: ${s.sold ?? 0}`} icon={<ShieldCheck className="h-5 w-5" />} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="متاح" value={s.available ?? 0} />
        <MiniStat label="مسحوب" value={s.assigned ?? 0} />
        <MiniStat label="قيمة المتاح" value={fmtMoney(Number(s.available_value ?? 0))} />
      </div>

      <Tabs defaultValue="networks" className="mt-4">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="networks">الشبكات</TabsTrigger>
          <TabsTrigger value="agents">المناديب</TabsTrigger>
          <TabsTrigger value="packages">الباقات</TabsTrigger>
          <TabsTrigger value="cards">الكروت</TabsTrigger>
        </TabsList>

        <TabsContent value="networks" className="mt-3">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الشبكة</Th><Th>المالك</Th><Th>الهاتف</Th><Th>مناديب</Th><Th>باقات</Th>
                    <Th>كروت</Th><Th>مباع</Th><Th>قيمة المبيعات</Th><Th>الحالة</Th><Th>الإنشاء</Th>
                  </tr>
                </thead>
                <tbody>
                  {(networks.data ?? []).map((n: any) => (
                    <tr key={n.id} className="border-t">
                      <Td className="font-semibold">{n.name}</Td>
                      <Td>{n.owner_username ?? "—"}</Td>
                      <Td dir="ltr">{displayPhone(n.owner_phone, n.owner_username)}</Td>
                      <Td>{n.agents_count}</Td>
                      <Td>{n.packages_count}</Td>
                      <Td>{n.cards_count}</Td>
                      <Td>{n.sold_count}</Td>
                      <Td>{fmtMoney(Number(n.sold_value ?? 0))} {n.currency}</Td>
                      <Td>{n.is_active ? <Badge>نشطة</Badge> : <Badge variant="secondary">موقوفة</Badge>}</Td>
                      <Td className="whitespace-nowrap text-xs">{fmtArabicDateTime(n.created_at)}</Td>
                    </tr>
                  ))}
                  {networks.data?.length === 0 && <tr><Td colSpan={10} className="text-center text-muted-foreground py-8">لا توجد شبكات</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-3">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الاسم</Th><Th>المستخدم</Th><Th>الهاتف</Th><Th>الشبكة</Th><Th>الدور</Th>
                    <Th>مبيعات</Th><Th>قيمة</Th><Th>الحالة</Th><Th>التسجيل</Th>
                  </tr>
                </thead>
                <tbody>
                  {(agents.data ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <Td>{a.full_name ?? "—"}</Td>
                      <Td>{a.username}</Td>
                      <Td dir="ltr">{displayPhone(a.phone, a.username)}</Td>
                      <Td>{a.network_name ?? "—"}</Td>
                      <Td>{a.role === "admin" ? "مدير" : "مندوب"}</Td>
                      <Td>{a.sold_count}</Td>
                      <Td>{fmtMoney(Number(a.sold_value ?? 0))}</Td>
                      <Td>{a.is_active ? <Badge>مفعل</Badge> : <Badge variant="secondary">موقوف</Badge>}</Td>
                      <Td className="whitespace-nowrap text-xs">{fmtArabicDateTime(a.created_at)}</Td>
                    </tr>
                  ))}
                  {agents.data?.length === 0 && <tr><Td colSpan={9} className="text-center text-muted-foreground py-8">لا يوجد مناديب</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-3">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الباقة</Th><Th>الشبكة</Th><Th>السعر</Th>
                    <Th>متاح</Th><Th>مسحوب</Th><Th>مباع</Th><Th>الحالة</Th>
                  </tr>
                </thead>
                <tbody>
                  {(packages.data ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <Td className="font-semibold">{p.name}</Td>
                      <Td>{p.network_name}</Td>
                      <Td>{fmtMoney(Number(p.price))} {p.currency}</Td>
                      <Td>{p.available}</Td>
                      <Td>{p.assigned}</Td>
                      <Td>{p.sold}</Td>
                      <Td>{p.is_active ? <Badge>نشطة</Badge> : <Badge variant="secondary">موقوفة</Badge>}</Td>
                    </tr>
                  ))}
                  {packages.data?.length === 0 && <tr><Td colSpan={7} className="text-center text-muted-foreground py-8">لا توجد باقات</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="cards" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الكرت..."
                className="pr-9"
                value={cardsFilter.search ?? ""}
                onChange={(e) => setCardsFilter((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={cardsFilter.network_id ?? ""}
              onChange={(e) => setCardsFilter((f) => ({ ...f, network_id: e.target.value || undefined }))}
            >
              <option value="">كل الشبكات</option>
              {(networks.data ?? []).map((n: any) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={cardsFilter.status ?? ""}
              onChange={(e) => setCardsFilter((f) => ({ ...f, status: e.target.value || undefined }))}
            >
              <option value="">كل الحالات</option>
              <option value="AVAILABLE">متاح</option>
              <option value="ASSIGNED">مسحوب</option>
              <option value="SOLD">مباع</option>
            </select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الرقم</Th><Th>كلمة السر</Th><Th>الحالة</Th><Th>الباقة</Th><Th>الشبكة</Th>
                    <Th>المندوب</Th><Th>الإنشاء</Th><Th>البيع</Th>
                  </tr>
                </thead>
                <tbody>
                  {(cards.data ?? []).map((c: any) => (
                    <tr key={c.id} className="border-t">
                      <Td dir="ltr" className="font-mono">{c.username}</Td>
                      <Td dir="ltr" className="font-mono">{c.password ?? "—"}</Td>
                      <Td>
                        {c.status === "SOLD" ? <Badge>مباع</Badge> :
                         c.status === "ASSIGNED" ? <Badge variant="secondary">مسحوب</Badge> :
                         <Badge variant="outline">متاح</Badge>}
                      </Td>
                      <Td>{c.package_name}</Td>
                      <Td>{c.network_name}</Td>
                      <Td>{c.sold_username ?? c.assigned_username ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">{fmtArabicDateTime(c.created_at)}</Td>
                      <Td className="whitespace-nowrap text-xs">{c.sold_at ? fmtArabicDateTime(c.sold_at) : "—"}</Td>
                    </tr>
                  ))}
                  {cards.data?.length === 0 && <tr><Td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد كروت</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: number | string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="text-primary">{icon}</div>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-right text-xs font-semibold border">{children}</th>;
}
function Td({ children, className, colSpan, dir }: { children: React.ReactNode; className?: string; colSpan?: number; dir?: "ltr" | "rtl" }) {
  return <td colSpan={colSpan} dir={dir} className={`px-3 py-2 border ${className ?? ""}`}>{children}</td>;
}
