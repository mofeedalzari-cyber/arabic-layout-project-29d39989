import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { superadminUpdateUserPhone } from "@/lib/superadmin-agents.functions";

import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { ResetPasswordButton } from "@/components/reset-requests-panel";
import { RefreshButton } from "@/components/refresh-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtMoney, displayPhone, fmtArabicDateTime, cleanPhoneLike } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Wifi,
  Users,
  Package as PkgIcon,
  CreditCard,
  Search,
  Power,
  PowerOff,
  Plus,
  Trash2,
  BarChart3,
  ArrowRight,
  Pencil,
} from "lucide-react";

export const Route = createFileRoute("/app/superadmin")({ component: SuperAdminPage });

function SuperAdminPage() {
  const { loading, isSuperadmin } = useAuth();
  if (loading) return null;
  if (!isSuperadmin) return <Navigate to="/app" />;
  return <SuperAdminPageInner />;
}

function SuperAdminPageInner() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const toggleNet = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("superadmin_set_network_active", {
        _network_id: id,
        _active: active,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.active ? "تم تفعيل الشبكة" : "تم إيقاف الشبكة");
      qc.invalidateQueries({ queryKey: ["sa-networks"] });
      qc.invalidateQueries({ queryKey: ["sa-stats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "فشل"),
  });

  const deleteNet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("superadmin_delete_network", {
        _network_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الشبكة بالكامل");
      qc.invalidateQueries({ queryKey: ["sa-networks"] });
      qc.invalidateQueries({ queryKey: ["sa-stats"] });
      qc.invalidateQueries({ queryKey: ["sa-agents"] });
      qc.invalidateQueries({ queryKey: ["sa-packages"] });
      qc.invalidateQueries({ queryKey: ["sa-cards"] });
    },
    onError: (e: any) => toast.error(e.message ?? "فشل الحذف"),
  });

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

  const [cardsFilter, setCardsFilter] = useState<{
    network_id?: string;
    status?: string;
    search?: string;
  }>({});
  const [agentsNetFilter, setAgentsNetFilter] = useState<string>("");
  const [agentsSearch, setAgentsSearch] = useState<string>("");
  const [networksSearch, setNetworksSearch] = useState<string>("");
  const [packagesNetFilter, setPackagesNetFilter] = useState<string>("");

  const cards = useQuery({
    queryKey: ["sa-cards", cardsFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_cards", {
        _network_id: cardsFilter.network_id ?? undefined,
        _package_id: undefined,
        _status: cardsFilter.status ?? undefined,
        _search: cardsFilter.search ?? undefined,
        _limit: 1000,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const s = stats.data ?? {};
  const [detailNetId, setDetailNetId] = useState<string | null>(null);
  const detailNet = (networks.data ?? []).find((n: any) => n.id === detailNetId) ?? null;

  if (detailNetId && detailNet) {
    return (
      <NetworkDetail
        network={detailNet}
        agents={(agents.data ?? []).filter((a: any) => a.network_id === detailNetId)}
        packages={(packages.data ?? []).filter((p: any) => p.network_id === detailNetId)}
        onBack={() => setDetailNetId(null)}
      />
    );
  }

  return (
    <div dir="rtl" className="space-y-4">

      <PageHeader
        title="مدير التطبيق العام"
        description="عرض شامل لكل الشبكات والمناديب والباقات والكروت."
      />
      <div className="mb-4 flex justify-start">
        <RefreshButton />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="الشبكات"
          value={s.networks ?? 0}
          sub={`نشطة: ${s.active_networks ?? 0}`}
          icon={<Wifi className="h-5 w-5" />}
        />
        <StatCard
          label="المناديب"
          value={s.agents ?? 0}
          sub={`مدراء الشبكات: ${s.admins ?? 0}`}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="الباقات"
          value={s.packages ?? 0}
          sub={`كروت: ${s.total_cards ?? 0}`}
          icon={<PkgIcon className="h-5 w-5" />}
        />
        <StatCard
          label="المبيعات"
          value={fmtMoney(Number(s.sold_value ?? 0))}
          sub={`مباع: ${s.sold ?? 0}`}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="متاح" value={s.available ?? 0} />
        <MiniStat label="مسحوب" value={s.assigned ?? 0} />
        <MiniStat label="قيمة المتاح" value={fmtMoney(Number(s.available_value ?? 0))} />
      </div>

      <Tabs defaultValue="networks" className="mt-4" dir="rtl">
        <TabsList dir="rtl" className="grid grid-cols-4 w-full">
          <TabsTrigger value="networks">الشبكات</TabsTrigger>
          <TabsTrigger value="agents">المناديب</TabsTrigger>
          <TabsTrigger value="packages">الباقات</TabsTrigger>
          <TabsTrigger value="cards">الكروت</TabsTrigger>
        </TabsList>

        <TabsContent value="networks" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث باسم الشبكة..."
                className="pr-9"
                value={networksSearch}
                onChange={(e) => setNetworksSearch(e.target.value)}
              />
            </div>
          </div>
          {/* بطاقات الشبكات — عرض مناسب للجوال */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(networks.data ?? [])
              .filter((n: any) => {
                const q = networksSearch.trim();
                if (!q) return true;
                return (n.name ?? "").toLowerCase().includes(q.toLowerCase());
              })
              .map((n: any) => (

              <Card key={n.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{n.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      المالك: {cleanPhoneLike(n.owner_username) || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {displayPhone(n.owner_phone, n.owner_username)}
                    </div>
                  </div>
                  {n.is_active ? (
                    <Badge>نشطة</Badge>
                  ) : (
                    <Badge variant="secondary">موقوفة</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <MiniStat label="مناديب" value={n.agents_count ?? 0} />
                  <MiniStat label="باقات" value={n.packages_count ?? 0} />
                  <MiniStat label="كروت" value={n.cards_count ?? 0} />
                  <MiniStat label="مباع" value={n.sold_count ?? 0} />
                </div>
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                  <div className="text-[11px] text-muted-foreground">قيمة المبيعات</div>
                  <div className="font-bold">{fmtMoney(Number(n.sold_value ?? 0))}</div>
                </div>
                <Button className="w-full" onClick={() => setDetailNetId(n.id)}>
                  <BarChart3 className="h-4 w-4 ml-1" />
                  تفاصيل وإدارة الشبكة
                </Button>
                <div className="flex flex-wrap gap-1">
                  <EditNetworkButton network={n} />
                  {n.owner_id ? (
                    <>
                      <ResetPasswordButton
                        userId={n.owner_id}
                        label={`مدير ${n.name}`}
                        triggerLabel="كلمة سر المدير"
                      />
                      <EditPhoneButton
                        userId={n.owner_id}
                        currentPhone={n.owner_phone ?? ""}
                        label={`مدير ${n.name}`}
                        triggerLabel="هاتف المدير"
                      />
                    </>
                  ) : null}
                  <NetworkActions network={n} />
                </div>
              </Card>
            ))}
            {networks.data?.filter((n: any) => {
              const q = networksSearch.trim();
              if (!q) return true;
              return (n.name ?? "").toLowerCase().includes(q.toLowerCase());
            }).length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                {networksSearch.trim() ? "لا توجد نتائج مطابقة" : "لا توجد شبكات"}
              </Card>
            )}
          </div>


          <Card className="overflow-hidden hidden lg:block">

            <div className="overflow-x-auto">
              <table dir="rtl" className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الشبكة</Th>
                    <Th>المالك</Th>
                    <Th>الهاتف</Th>
                    <Th>مناديب</Th>
                    <Th>باقات</Th>
                    <Th>كروت</Th>
                    <Th>مباع</Th>
                    <Th>قيمة المبيعات</Th>
                    <Th>الحالة</Th>
                    <Th>الإنشاء</Th>
                    <Th>إجراءات</Th>
                  </tr>
                </thead>
                <tbody>
                  {(networks.data ?? [])
                    .filter((n: any) => {
                      const q = networksSearch.trim();
                      if (!q) return true;
                      return (n.name ?? "").toLowerCase().includes(q.toLowerCase());
                    })
                    .map((n: any) => (
                      <tr key={n.id} className="border-t">
                        <Td className="font-semibold">{n.name}</Td>
                        <Td>{cleanPhoneLike(n.owner_username) || "—"}</Td>
                        <Td dir="ltr">{displayPhone(n.owner_phone, n.owner_username)}</Td>
                        <Td>{n.agents_count}</Td>
                        <Td>{n.packages_count}</Td>
                        <Td>{n.cards_count}</Td>
                        <Td>{n.sold_count}</Td>
                        <Td>{fmtMoney(Number(n.sold_value ?? 0))}</Td>
                        <Td>
                          {n.is_active ? (
                            <Badge>نشطة</Badge>
                          ) : (
                            <Badge variant="secondary">موقوفة</Badge>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-xs">
                          {fmtArabicDateTime(n.created_at)}
                        </Td>
                        <Td>
                          <div className="flex gap-1 flex-wrap">
                            {n.owner_id ? (
                              <ResetPasswordButton userId={n.owner_id} label={`مدير ${n.name}`} />
                            ) : null}
                            <Button
                              size="sm"
                              variant={n.is_active ? "destructive" : "default"}
                              disabled={toggleNet.isPending}
                              onClick={() => {
                                const msg = n.is_active
                                  ? `إيقاف شبكة "${n.name}"؟ لن يتمكن مستخدموها من الدخول.`
                                  : `إعادة تفعيل شبكة "${n.name}"؟`;
                                if (window.confirm(msg))
                                  toggleNet.mutate({ id: n.id, active: !n.is_active });
                              }}
                            >
                              {n.is_active ? (
                                <>
                                  <PowerOff className="h-4 w-4 ml-1" />
                                  إيقاف
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4 ml-1" />
                                  تفعيل
                                </>
                              )}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={deleteNet.isPending}
                                >
                                  <Trash2 className="h-4 w-4 ml-1" />
                                  حذف
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent dir="rtl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>حذف نهائي لشبكة "{n.name}"؟</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    سيتم حذف جميع المناديب والباقات والكروت والطلبات والمبيعات
                                    المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteNet.mutate(n.id)}
                                  >
                                    نعم، حذف نهائي
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  {networks.data?.filter((n: any) => {
                    const q = networksSearch.trim();
                    if (!q) return true;
                    return (n.name ?? "").toLowerCase().includes(q.toLowerCase());
                  }).length === 0 && (

                    <tr>
                      <Td colSpan={11} className="text-center text-muted-foreground py-8">
                        {networksSearch.trim() ? "لا توجد نتائج مطابقة" : "لا توجد شبكات"}
                      </Td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث باسم المندوب أو الهاتف..."
                className="pr-9"
                value={agentsSearch}
                onChange={(e) => setAgentsSearch(e.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={agentsNetFilter}
              onChange={(e) => setAgentsNetFilter(e.target.value)}
            >
              <option value="">كل الشبكات</option>
              {(networks.data ?? []).map((n: any) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table dir="rtl" className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الاسم</Th>
                    <Th>المستخدم</Th>
                    <Th>الهاتف</Th>
                    <Th>الشبكة</Th>
                    <Th>الدور</Th>
                    <Th>مبيعات</Th>
                    <Th>قيمة</Th>
                    <Th>الحالة</Th>
                    <Th>التسجيل</Th>
                    <Th>تعديل الهاتف</Th>
                    <Th>كلمة المرور</Th>
                    <Th>إجراءات</Th>


                  </tr>
                </thead>
                <tbody>
                  {(agents.data ?? [])
                    .filter((a: any) => {
                      const netOk = !agentsNetFilter || a.network_id === agentsNetFilter;
                      const q = agentsSearch.trim();
                      if (!netOk) return false;
                      if (!q) return true;
                      const hay = [
                        a.full_name ?? "",
                        a.username ?? "",
                        a.phone ?? "",
                        a.network_name ?? "",
                      ]
                        .join(" ")
                        .toLowerCase();
                      return hay.includes(q.toLowerCase());
                    })
                    .map((a: any) => (
                      <tr key={a.id} className="border-t">
                        <Td>{a.full_name ?? "—"}</Td>
                        <Td>{cleanPhoneLike(a.username)}</Td>
                        <Td dir="ltr">{displayPhone(a.phone, a.username)}</Td>
                        <Td>{a.network_name ?? "—"}</Td>
                        <Td>{a.role === "admin" ? "مدير" : "مندوب"}</Td>
                        <Td>{a.sold_count}</Td>
                        <Td>{fmtMoney(Number(a.sold_value ?? 0))}</Td>
                        <Td>
                          {a.is_active ? (
                            <Badge>مفعل</Badge>
                          ) : (
                            <Badge variant="secondary">موقوف</Badge>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-xs">
                          {fmtArabicDateTime(a.created_at)}
                        </Td>
                        <Td>
                          <EditPhoneButton
                            userId={a.id}
                            currentPhone={a.phone ?? ""}
                            label={a.full_name ?? cleanPhoneLike(a.username) ?? ""}
                          />
                        </Td>
                        <Td>
                          <ResetPasswordButton
                            userId={a.id}
                            label={a.full_name ?? cleanPhoneLike(a.username) ?? ""}
                          />
                        </Td>
                        <Td>
                          <AgentActions agent={a} />
                        </Td>
                      </tr>
                    ))}
                  {agents.data?.filter((a: any) => {
                    const netOk = !agentsNetFilter || a.network_id === agentsNetFilter;
                    const q = agentsSearch.trim();
                    if (!netOk) return false;
                    if (!q) return true;
                    const hay = [
                      a.full_name ?? "",
                      a.username ?? "",
                      a.phone ?? "",
                      a.network_name ?? "",
                    ]
                      .join(" ")
                      .toLowerCase();
                    return hay.includes(q.toLowerCase());
                  }).length === 0 && (
                    <tr>
                      <Td colSpan={12} className="text-center text-muted-foreground py-8">
                        {agentsSearch.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد مناديب"}
                      </Td>
                    </tr>
                  )}
                </tbody>

              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={packagesNetFilter}
              onChange={(e) => setPackagesNetFilter(e.target.value)}
            >
              <option value="">كل الشبكات</option>
              {(networks.data ?? []).map((n: any) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table dir="rtl" className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الباقة</Th>
                    <Th>الشبكة</Th>
                    <Th>السعر</Th>
                    <Th>متاح</Th>
                    <Th>مسحوب</Th>
                    <Th>مباع</Th>
                    <Th>الحالة</Th>
                  </tr>
                </thead>
                <tbody>
                  {(packages.data ?? [])
                    .filter((p: any) => !packagesNetFilter || p.network_id === packagesNetFilter)
                    .map((p: any) => (
                      <tr key={p.id} className="border-t">
                        <Td className="font-semibold">{p.name}</Td>
                        <Td>{p.network_name}</Td>
                        <Td>{fmtMoney(Number(p.price))}</Td>
                        <Td>{p.available}</Td>
                        <Td>{p.assigned}</Td>
                        <Td>{p.sold}</Td>
                        <Td>
                          {p.is_active ? (
                            <Badge>نشطة</Badge>
                          ) : (
                            <Badge variant="secondary">موقوفة</Badge>
                          )}
                        </Td>
                      </tr>
                    ))}
                  {packages.data?.length === 0 && (
                    <tr>
                      <Td colSpan={7} className="text-center text-muted-foreground py-8">
                        لا توجد باقات
                      </Td>
                    </tr>
                  )}
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
              onChange={(e) =>
                setCardsFilter((f) => ({ ...f, network_id: e.target.value || undefined }))
              }
            >
              <option value="">كل الشبكات</option>
              {(networks.data ?? []).map((n: any) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={cardsFilter.status ?? ""}
              onChange={(e) =>
                setCardsFilter((f) => ({ ...f, status: e.target.value || undefined }))
              }
            >
              <option value="">كل الحالات</option>
              <option value="AVAILABLE">متاح</option>
              <option value="ASSIGNED">مسحوب</option>
              <option value="SOLD">مباع</option>
            </select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table dir="rtl" className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50">
                  <tr>
                    <Th>الرقم</Th>
                    <Th>كلمة السر</Th>
                    <Th>الحالة</Th>
                    <Th>الباقة</Th>
                    <Th>الشبكة</Th>
                    <Th>المندوب</Th>
                    <Th>الإنشاء</Th>
                    <Th>البيع</Th>
                  </tr>
                </thead>
                <tbody>
                  {(cards.data ?? []).map((c: any) => (
                    <tr
                      key={c.id}
                      className={
                        "border-t " +
                        (c.status === "AVAILABLE"
                          ? "bg-success/10"
                          : c.status === "ASSIGNED"
                            ? "bg-blue-500/10"
                            : c.status === "SOLD"
                              ? "bg-destructive/10"
                              : "")
                      }
                    >
                      <Td dir="ltr" className="font-mono">
                        {c.username}
                      </Td>
                      <Td dir="ltr" className="font-mono">
                        {c.password ?? "—"}
                      </Td>
                      <Td>
                        {c.status === "SOLD" ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                            مباع
                          </span>
                        ) : c.status === "ASSIGNED" ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                            مسحوب
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
                            متاح
                          </span>
                        )}
                      </Td>
                      <Td>{c.package_name}</Td>
                      <Td>{c.network_name}</Td>
                      <Td>{cleanPhoneLike(c.sold_username ?? c.assigned_username) || "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">
                        {fmtArabicDateTime(c.created_at)}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {c.sold_at ? fmtArabicDateTime(c.sold_at) : "—"}
                      </Td>
                    </tr>
                  ))}
                  {cards.data?.length === 0 && (
                    <tr>
                      <Td colSpan={8} className="text-center text-muted-foreground py-8">
                        لا توجد كروت
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
}) {
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
function Td({
  children,
  className,
  colSpan,
  dir,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
  dir?: "ltr" | "rtl";
}) {
  return (
    <td colSpan={colSpan} dir={dir} className={`px-3 py-2 border ${className ?? ""}`}>
      {children}
    </td>
  );
}

function MyNetworkPanel({
  myNetwork,
  onCreated,
}: {
  myNetwork: any | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_my_network", { _name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إنشاء شبكتك بنجاح");
      setOpen(false);
      setName("");
      onCreated();
    },
    onError: (e: any) => toast.error(e.message ?? "فشل الإنشاء"),
  });

  if (myNetwork) {
    return (
      <Card className="p-4 flex items-center justify-between gap-3 bg-primary/5 border-primary/30">
        <div className="flex items-center gap-3">
          <Wifi className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm text-muted-foreground">شبكتي الخاصة</div>
            <div className="font-bold text-base">{myNetwork.name}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground text-left">
          استخدم القائمة الجانبية لإدارة الباقات والمناديب والطلبات
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 flex items-center justify-between gap-3 border-dashed">
      <div>
        <div className="font-semibold">أنشئ شبكتك الخاصة كمدير تطبيق</div>
        <div className="text-xs text-muted-foreground mt-1">
          ستستطيع إضافة باقات ومناديب وقبول طلبات الانضمام مثل أي مدير شبكة.
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 ml-1" />
            إنشاء شبكتي
          </Button>
        </DialogTrigger>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء شبكة خاصة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>اسم الشبكة</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: شبكة مدير التطبيق"
            />
          </div>
          <DialogFooter>
            <Button disabled={m.isPending || !name.trim()} onClick={() => m.mutate()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EditPhoneButton({
  userId,
  currentPhone,
  label,
  triggerLabel,
}: {
  userId: string;
  currentPhone: string;
  label: string;
  triggerLabel?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(currentPhone);
  const updatePhone = useServerFn(superadminUpdateUserPhone);
  const m = useMutation({
    mutationFn: async () => {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 6) throw new Error("رقم الهاتف غير صحيح");
      return await updatePhone({ data: { userId, phone: digits } });
    },
    onSuccess: () => {
      toast.success("تم تعديل رقم الهاتف");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["sa-agents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التعديل"),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setPhone(currentPhone);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerLabel ?? "تعديل"}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل رقم الهاتف {label ? `— ${label}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>رقم الهاتف</Label>
          <Input
            dir="ltr"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="7xxxxxxxx"
          />
          <p className="text-xs text-muted-foreground">
            سيتم تحديث اسم الدخول تلقائيًا حسب الرقم الجديد.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** واجهة تفاصيل وإحصائيات شبكة واحدة */
function NetworkDetail({
  network,
  agents,
  packages,
  onBack,
}: {
  network: any;
  agents: any[];
  packages: any[];
  onBack: () => void;
}) {
  const cards = useQuery({
    queryKey: ["sa-net-cards", network.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_cards", {
        _network_id: network.id,
        _package_id: undefined,
        _status: undefined,
        _search: undefined,
        _limit: 5000,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const list = cards.data ?? [];
  const available = list.filter((c) => c.status === "AVAILABLE").length;
  const assigned = list.filter((c) => c.status === "ASSIGNED").length;
  const sold = list.filter((c) => c.status === "SOLD").length;
  const priceOf = (pkgId: string) =>
    Number(packages.find((p) => p.id === pkgId)?.price ?? 0);
  const soldValue = list
    .filter((c) => c.status === "SOLD")
    .reduce((sum, c) => sum + priceOf(c.package_id), 0);
  const stockValue = list
    .filter((c) => c.status !== "SOLD")
    .reduce((sum, c) => sum + priceOf(c.package_id), 0);

  const perPackage = packages.map((p) => {
    const pc = list.filter((c) => c.package_id === p.id);
    const s = pc.filter((c) => c.status === "SOLD").length;
    return {
      ...p,
      total: pc.length,
      sold: s,
      remaining: pc.length - s,
      value: s * Number(p.price ?? 0),
    };
  });

  const perAgent = agents
    .map((a) => {
      const ac = list.filter((c) => c.sold_to === a.id);
      return {
        ...a,
        soldCount: ac.length,
        soldValue: ac.reduce((sum, c) => sum + priceOf(c.package_id), 0),
        assignedCount: list.filter((c) => c.status === "ASSIGNED" && c.assigned_to === a.id).length,
      };
    })
    .sort((x, y) => y.soldValue - x.soldValue);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowRight className="h-4 w-4 ml-1" />
          رجوع للشبكات
        </Button>
        <RefreshButton />
      </div>

      <Card className="p-4 bg-primary/5 border-primary/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-lg truncate">{network.name}</h2>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              المالك: {cleanPhoneLike(network.owner_username) || "—"} •{" "}
              <span dir="ltr">{displayPhone(network.owner_phone, network.owner_username)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              تاريخ الإنشاء: {fmtArabicDateTime(network.created_at)}
            </div>
          </div>
          {network.is_active ? <Badge>نشطة</Badge> : <Badge variant="secondary">موقوفة</Badge>}
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="المناديب"
          value={agents.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="الباقات"
          value={packages.length}
          icon={<PkgIcon className="h-5 w-5" />}
        />
        <StatCard
          label="الكروت"
          value={list.length}
          sub={`متاح: ${available} • مسحوب: ${assigned}`}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <StatCard
          label="قيمة المبيعات"
          value={fmtMoney(soldValue)}
          sub={`مباع: ${sold}`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="متاح" value={available} />
        <MiniStat label="مسحوب" value={assigned} />
        <MiniStat label="قيمة المخزون" value={fmtMoney(stockValue)} />
      </div>

      <Card className="p-3 flex flex-wrap gap-2">
        <EditNetworkButton network={network} />
        {network.owner_id ? (
          <>
            <ResetPasswordButton
              userId={network.owner_id}
              label={`مدير ${network.name}`}
              triggerLabel="كلمة سر المدير"
            />
            <EditPhoneButton
              userId={network.owner_id}
              currentPhone={network.owner_phone ?? ""}
              label={`مدير ${network.name}`}
              triggerLabel="هاتف المدير"
            />
          </>
        ) : null}
        <NetworkActions network={network} onDeleted={onBack} />
      </Card>

      <Tabs defaultValue="agents" dir="rtl" className="mt-2">
        <TabsList dir="rtl" className="grid grid-cols-3 w-full">
          <TabsTrigger value="agents">المناديب</TabsTrigger>
          <TabsTrigger value="pkgs">الباقات</TabsTrigger>
          <TabsTrigger value="cards">الكروت</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-3">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table dir="rtl" className="w-full text-sm border-collapse border">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <Th>الرقم</Th>
                    <Th>كلمة السر</Th>
                    <Th>الحالة</Th>
                    <Th>الباقة</Th>
                    <Th>المندوب</Th>
                    <Th>البيع</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c: any) => (
                    <tr key={c.id} className="border-t">
                      <Td dir="ltr" className="font-mono">
                        {c.username}
                      </Td>
                      <Td dir="ltr" className="font-mono">
                        {c.password ?? "—"}
                      </Td>
                      <Td className="text-xs">
                        {c.status === "SOLD" ? "مباع" : c.status === "ASSIGNED" ? "مسحوب" : "متاح"}
                      </Td>
                      <Td>{c.package_name}</Td>
                      <Td>{cleanPhoneLike(c.sold_username ?? c.assigned_username) || "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">
                        {c.sold_at ? fmtArabicDateTime(c.sold_at) : "—"}
                      </Td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <Td colSpan={6} className="text-center text-muted-foreground py-8">
                        لا توجد كروت
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>


        <TabsContent value="pkgs" className="mt-3 space-y-3">
          {perPackage.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="font-semibold truncate">{p.name}</div>
                <Badge variant="secondary">{fmtMoney(Number(p.price ?? 0))}</Badge>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <MiniStat label="كروت" value={p.total} />
                <MiniStat label="مباع" value={p.sold} />
                <MiniStat label="متبقي" value={p.remaining} />
                <MiniStat label="القيمة" value={fmtMoney(p.value)} />
              </div>
            </Card>
          ))}
          {perPackage.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">لا توجد باقات</Card>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-3 space-y-3">
          {perAgent.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {a.full_name || cleanPhoneLike(a.username)}
                  </div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {displayPhone(a.phone, a.username)}
                  </div>
                </div>
                {a.is_active ? (
                  <Badge>نشط</Badge>
                ) : (
                  <Badge variant="secondary">موقوف</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="مباع" value={a.soldCount} />
                <MiniStat label="مسحوب" value={a.assignedCount} />
                <MiniStat label="القيمة" value={fmtMoney(a.soldValue)} />
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                <EditPhoneButton
                  userId={a.id}
                  currentPhone={a.phone ?? ""}
                  label={a.full_name || cleanPhoneLike(a.username) || ""}
                  triggerLabel="تعديل الهاتف"
                />
                <ResetPasswordButton
                  userId={a.id}
                  label={a.full_name || cleanPhoneLike(a.username) || ""}
                  triggerLabel="كلمة المرور"
                />
                <AgentActions agent={a} />
              </div>

            </Card>
          ))}
          {perAgent.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">لا يوجد مناديب</Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** تعديل بيانات الشبكة (الاسم والعملة) */
function EditNetworkButton({ network }: { network: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(network.name ?? "");
  const [currency, setCurrency] = useState(network.currency ?? "");
  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("اسم الشبكة مطلوب");
      const { error } = await (supabase.rpc as any)("superadmin_update_network", {
        _network_id: network.id,
        _name: name.trim(),
        _currency: currency.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تعديل بيانات الشبكة");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["sa-networks"] });
    },
    onError: (e: any) =>
      toast.error(e?.message === "NETWORK_NAME_TAKEN" ? "اسم الشبكة مستخدم" : (e?.message ?? "فشل")),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(network.name ?? "");
          setCurrency(network.currency ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4 ml-1" />
          تعديل الشبكة
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الشبكة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>اسم الشبكة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>العملة</Label>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="SAR"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** إجراءات الشبكة: توقيف/تفعيل + حذف نهائي */
function NetworkActions({ network, onDeleted }: { network: any; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const invalidateAll = () => {
    ["sa-networks", "sa-stats", "sa-agents", "sa-packages", "sa-cards"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("superadmin_set_network_active", {
        _network_id: network.id,
        _active: !network.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(network.is_active ? "تم إيقاف الشبكة" : "تم تفعيل الشبكة");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل"),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("superadmin_delete_network", {
        _network_id: network.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الشبكة بالكامل");
      invalidateAll();
      onDeleted?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });

  return (
    <>
      <Button
        size="sm"
        variant={network.is_active ? "secondary" : "default"}
        disabled={toggle.isPending}
        onClick={() => {
          const msg = network.is_active
            ? `إيقاف شبكة "${network.name}"؟ لن يتمكن مستخدموها من الدخول.`
            : `إعادة تفعيل شبكة "${network.name}"؟`;
          if (window.confirm(msg)) toggle.mutate();
        }}
      >
        {network.is_active ? (
          <>
            <PowerOff className="h-4 w-4 ml-1" />
            إيقاف
          </>
        ) : (
          <>
            <Power className="h-4 w-4 ml-1" />
            تفعيل
          </>
        )}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={del.isPending}>
            <Trash2 className="h-4 w-4 ml-1" />
            حذف
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نهائي لشبكة "{network.name}"؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف جميع المناديب والباقات والكروت والطلبات والمبيعات المرتبطة بها. لا يمكن
              التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate()}
            >
              نعم، حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** إجراءات المندوب: توقيف/تفعيل + حذف نهائي */
function AgentActions({ agent }: { agent: any }) {
  const qc = useQueryClient();
  const invalidateAll = () => {
    ["sa-agents", "sa-networks", "sa-stats", "sa-cards"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
    qc.invalidateQueries({ queryKey: ["sa-net-cards"] });
  };
  const name = agent.full_name || cleanPhoneLike(agent.username) || "المندوب";
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("superadmin_set_agent_active", {
        _agent_id: agent.id,
        _active: !agent.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(agent.is_active ? "تم إيقاف المستخدم" : "تم تفعيل المستخدم");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل"),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("superadmin_delete_agent", {
        _agent_id: agent.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المستخدم نهائيًا");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });

  return (
    <div className="flex gap-1 flex-wrap">
      <Button
        size="sm"
        variant={agent.is_active ? "secondary" : "default"}
        disabled={toggle.isPending}
        onClick={() => {
          const msg = agent.is_active ? `إيقاف "${name}"؟` : `تفعيل "${name}"؟`;
          if (window.confirm(msg)) toggle.mutate();
        }}
      >
        {agent.is_active ? (
          <>
            <PowerOff className="h-4 w-4 ml-1" />
            إيقاف
          </>
        ) : (
          <>
            <Power className="h-4 w-4 ml-1" />
            تفعيل
          </>
        )}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={del.isPending}>
            <Trash2 className="h-4 w-4 ml-1" />
            حذف
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف "{name}" نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إرجاع الكروت المسحوبة إلى المتاح والحفاظ على سجل المبيعات، وحذف الحساب نهائيًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate()}
            >
              نعم، حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
