import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { RefreshButton } from "@/components/refresh-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Wifi,
  ShieldAlert,
  Check,
  Copy,
  Share2,
  MessageCircle,
  PackageOpen,
  Tag,
  RefreshCw,
  Search,
  User as UserIcon,
  Printer,
  Image as ImageIcon,
  UserPlus,
  Users,
  Trash2,
  Eye,
  EyeOff,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RevealText } from "@/components/reveal-text";
import { fmtMoney, fmtArabicDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { notifyNewSale } from "@/lib/push.functions";
import { CardTemplateDialog } from "@/components/card-template-dialog";
import { loadTemplate, printCards, printCardsPdf } from "@/lib/card-print";
import { pickContact } from "@/lib/pick-contact";
import {
  createHotspotUser,
  generateCredentials,
  removeHotspotUser,
  type HotspotRouter,
} from "@/lib/hotspot-provision";

export const Route = createFileRoute("/app/cabin")({
  head: () => ({
    meta: [
      { title: "كبينة البيع — كرتي" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "بيع كروت الإنترنت للزبائن بسرعة وإرسال الكرت عبر واتساب." },
      { property: "og:title", content: "كبينة البيع — كرتي" },
      { property: "og:description", content: "بيع كروت الإنترنت للزبائن بسرعة وإرسال الكرت عبر واتساب." },
    ],
  }),
  component: CabinPage });

interface CabinRow {
  package_id: string;
  package_name: string;
  network_id: string;
  network_name: string;
  price: number;
  color: string | null;
  data_size: string | null;
  speed: string | null;
  validity: string | null;
  currency: string;
  available: number;
  sold_count: number;
}

interface Customer {
  id: string;
  name: string;
  whatsapp: string;
  network_id: string | null;
}

function normalizeWa(v: string) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  // Strip existing country code / leading zero so we always store 967XXXXXXXXX
  if (d.startsWith("967")) d = d.slice(3);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return "967" + d;
}

function localYemenDigits(v: string) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("967")) d = d.slice(3);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d;
}

function CabinPage() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["agent-cabin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agent_cabin");
      if (error) throw error;
      return (data ?? []) as CabinRow[];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["my-customers", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, whatsapp, network_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  // 📡 راوتر الشبكة (إن سمح المدير بالبيع الفوري) — لإنشاء المستخدم لحظة البيع
  const { data: router } = useQuery({
    queryKey: ["agent-hotspot-router"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agent_hotspot_router");
      if (error) return null;
      const r = Array.isArray(data) ? data[0] : data;
      return (r ?? null) as HotspotRouter | null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: pkgProfiles } = useQuery({
    queryKey: ["pkg-hotspot-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("id, hotspot_profile");
      if (error) return {} as Record<string, string | null>;
      const map: Record<string, string | null> = {};
      for (const p of data ?? []) map[(p as any).id] = (p as any).hotspot_profile ?? null;
      return map;
    },
    staleTime: 5 * 60_000,
  });

  const [instantMode, setInstantMode] = useState(false);
  const [confirmPkg, setConfirmPkg] = useState<CabinRow | null>(null);
  const [saleResult, setSaleResult] = useState<any>(null);
  const [selling, setSelling] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState<CabinRow | null>(null);
  const [selCustomer, setSelCustomer] = useState<Customer | null>(null);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [custComboOpen, setCustComboOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWa, setNewWa] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers ?? [];
    return (customers ?? []).filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.whatsapp ?? "").includes(q),
    );
  }, [customers, custSearch]);

  async function createCustomer(): Promise<Customer | null> {
    if (!user) return null;
    const name = newName.trim();
    const wa = normalizeWa(newWa);
    if (!name) {
      toast.error("أدخل اسم الزبون");
      return null;
    }
    if (wa.length < 7) {
      toast.error("رقم واتساب غير صحيح");
      return null;
    }
    const { data, error } = await supabase
      .from("customers")
      .insert({
        agent_id: user.id,
        network_id: profile?.network_id ?? null,
        name,
        whatsapp: wa,
      })
      .select("id, name, whatsapp, network_id")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    setNewName("");
    setNewWa("");
    setAddingCustomer(false);
    qc.invalidateQueries({ queryKey: ["my-customers"] });
    toast.success("تم إضافة الزبون");
    return data as Customer;
  }

  async function deleteCustomer(id: string) {
    const { error } = await supabase.rpc("delete_customer", { _customer_id: id });
    if (error) {
      toast.error("تعذر حذف الزبون: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["my-customers"] });
    qc.invalidateQueries({ queryKey: ["agent-cabin"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["cards"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["dash-cards"] });
    qc.invalidateQueries({ queryKey: ["dash-sales-all"] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
    toast.success("تم حذف حساب الزبون مع بقاء المبيعات كما هي");
  }

  async function confirmSell() {
    if (!confirmPkg) return;
    if (!selCustomer) {
      toast.error("يجب اختيار الزبون قبل تأكيد البيع");
      return;
    }
    setSelling(true);
    const useInstant = instantMode && !!router;
    let data: any = null;
    let error: any = null;

    if (useInstant) {
      // 🔌 بيع فوري: أنشئ المستخدم في الميكروتك ثم سجّل المبيعة
      const creds = generateCredentials(confirmPkg.package_name);
      try {
        await createHotspotUser(router!, {
          username: creds.username,
          password: creds.password,
          profile: pkgProfiles?.[confirmPkg.package_id] ?? undefined,
          comment: `karti:${confirmPkg.package_name}`,
        });
      } catch (e: any) {
        setSelling(false);
        toast.error(e?.message || "تعذّر إنشاء المستخدم في الميكروتك — تأكد أنك متصل بشبكة الراوتر");
        return;
      }
      const res = await supabase.rpc("sell_instant_card", {
        _package_id: confirmPkg.package_id,
        _username: creds.username,
        _password: creds.password,
      });
      data = res.data;
      error = res.error;
      if (error) await removeHotspotUser(router!, creds.username);
    } else {
      const res = await supabase.rpc("sell_card", { _package_id: confirmPkg.package_id });
      data = res.data;
      error = res.error;
    }

    if (error) {
      setSelling(false);
      const map: Record<string, string> = {
        NO_CARDS_AVAILABLE: "لا توجد كروت في كبينتك لهذه الباقة",
        ACCOUNT_INACTIVE: "حسابك غير مفعّل",
        FORBIDDEN: "غير مصرح",
        PACKAGE_NOT_FOUND: "الباقة غير موجودة",
        NETWORK_INACTIVE: "الشبكة موقوفة",
        CARD_EXISTS: "اسم المستخدم مستخدم مسبقاً — أعد المحاولة",
        USERNAME_REQUIRED: "تعذّر توليد اسم المستخدم",
      };
      const key = Object.keys(map).find((k) => error.message.includes(k));
      toast.error(key ? map[key] : error.message);
      return;
    }
    const sale: any = Array.isArray(data) ? data[0] : data;
    if (selCustomer && sale?.sale_id) {
      await supabase
        .from("sales")
        .update({ customer_id: selCustomer.id, buyer_name: selCustomer.name })
        .eq("id", sale.sale_id);
      sale.customer = selCustomer;
      sale.buyer_name = selCustomer.name;
    }
    if (profile?.network_id) {
      void notifyNewSale({
        data: {
          networkId: profile.network_id,
          saleId: sale?.sale_id ?? undefined,
          agentName: profile?.full_name || profile?.username || undefined,
          packageName: confirmPkg.package_name ?? undefined,
          price: Number(confirmPkg.price) || undefined,
          customerName: selCustomer?.name ?? undefined,
        },
      }).catch(() => {});
    }
    setSelling(false);
    setConfirmPkg(null);
    setSaleResult(sale);
    setSelCustomer(null);
    qc.invalidateQueries({ queryKey: ["agent-cabin"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
  }

  const totalAvail = rows?.reduce((a, r) => a + r.available, 0) ?? 0;
  const totalSold = rows?.reduce((a, r) => a + r.sold_count, 0) ?? 0;
  const totalValue = rows?.reduce((a, r) => a + r.available * Number(r.price), 0) ?? 0;

  return (
    <>
      <PageHeader title="كبينة البيع" description="الكروت المُخصّصة لك — جاهزة للبيع" />

      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <RefreshButton queryKeys={[["agent-cabin"], ["sales"], ["my-sales-stats"]]} />
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setCustomersOpen(true)}
        >
          <Users className="h-4 w-4 ml-1" />
          الزبائن ({customers?.length ?? 0})
        </Button>
        {router && (
          <Button
            variant={instantMode ? "default" : "outline"}
            size="sm"
            className={`rounded-xl ${instantMode ? "gradient-primary-bg border-0" : ""}`}
            onClick={() => setInstantMode((v) => !v)}
          >
            <Zap className="h-4 w-4 ml-1" />
            {instantMode ? "البيع الفوري مُفعّل" : "بيع فوري (بدون كرت)"}
          </Button>
        )}
      </div>

      {router && instantMode && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-primary/10 p-3 text-xs text-foreground">
          <Zap className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <span>
            البيع الفوري عبر الراوتر <strong>{router.name}</strong> — يتم إنشاء اسم مستخدم وكلمة سر
            جديدين في الميكروتك لحظة البيع بدون الحاجة لكروت محمّلة مسبقاً. يجب أن يكون جهازك متصلاً
            بشبكة الراوتر.
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatMini label="متوفر" value={String(totalAvail)} tone="success" />
        <StatMini label="مباع" value={String(totalSold)} tone="warning" />
        <StatMini label="قيمة المتاح" value={fmtMoney(totalValue)} tone="primary" />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جارٍ التحميل...</div>
      ) : (rows?.filter((r) => instantMode || r.available > 0).length ?? 0) === 0 ? (
        <div className="text-center py-16 space-y-3">
          <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground" />
          <div className="text-muted-foreground">لا توجد كروت متاحة في كبينتك.</div>
          <div className="text-xs text-muted-foreground">
            {router
              ? "فعّل البيع الفوري لإنشاء الكروت مباشرة من الميكروتك."
              : "اذهب إلى الشبكات واطلب كروت من المدير."}
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows!.filter((r) => instantMode || r.available > 0).map((r) => {
            const noStock = !instantMode && r.available === 0;
            return (
              <Card
                key={r.package_id}
                className={`card-elegant border-0 overflow-hidden p-0 ${r.color ? "text-white" : "pkg-plain"}`}
                style={
                  r.color
                    ? { background: `linear-gradient(135deg, ${r.color}, ${r.color}c0)` }
                    : undefined
                }
              >
                <div className="p-5 relative">
                  <Wifi className={`absolute top-3 left-3 h-5 w-5 ${r.color ? "text-white/40" : "text-muted-foreground/40"}`} />
                  <div className={`text-[11px] mb-1 ${r.color ? "text-white/80" : "text-muted-foreground"}`}>{r.network_name}</div>
                  <div className={`text-sm mb-1 ${r.color ? "text-white" : "text-foreground"}`}>{r.package_name}</div>
                  <div className={`text-2xl font-extrabold ${r.color ? "text-white" : "text-foreground"}`}>
                    {fmtMoney(Number(r.price))}
                  </div>
                  <div className={`mt-3 flex flex-wrap gap-1.5 text-[11px] ${r.color ? "text-white/90" : "text-muted-foreground"}`}>
                    {r.data_size && (
                      <span className={`px-2 py-0.5 rounded-full ${r.color ? "bg-white/20" : "bg-muted"}`}>{r.data_size}</span>
                    )}
                    {r.speed && (
                      <span className={`px-2 py-0.5 rounded-full ${r.color ? "bg-white/20" : "bg-muted"}`}>{r.speed}</span>
                    )}
                    {r.validity && (
                      <span className={`px-2 py-0.5 rounded-full ${r.color ? "bg-white/20" : "bg-muted"}`}>{r.validity}</span>
                    )}
                  </div>
                </div>
                <div className={`p-4 ${r.color ? "bg-black/10" : "bg-muted/40"}`}>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs mb-3">
                    <button
                      type="button"
                      onClick={() => setDetailsPkg(r)}
                      className={`rounded-lg py-1.5 transition ${r.color ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/70"}`}
                    >
                      <div className={`font-bold text-lg ${r.color ? "text-white" : "text-foreground"}`}>{r.available}</div>
                      <div className={`text-[10px] ${r.color ? "text-white/75" : "text-muted-foreground"}`}>متاحة الآن</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailsPkg(r)}
                      className={`rounded-lg py-1.5 transition ${r.color ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/70"}`}
                    >
                      <div className={`font-bold text-lg ${r.color ? "text-white" : "text-foreground"}`}>{r.sold_count}</div>
                      <div className={`text-[10px] ${r.color ? "text-white/75" : "text-muted-foreground"}`}>مباع</div>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDetailsPkg(r)}
                      className={`w-full rounded-xl font-semibold h-10 ${r.color ? "bg-white/15 border-white/40 text-white hover:bg-white/25 hover:text-white" : "bg-muted border-border text-foreground hover:bg-muted/80"}`}
                    >
                      التفاصيل
                    </Button>
                    <Button
                      disabled={noStock}
                      onClick={() => setConfirmPkg(r)}
                      className={`w-full rounded-xl border-0 font-semibold h-10 ${r.color ? "bg-white text-foreground hover:bg-white/90" : "gradient-primary-bg text-primary-foreground hover:opacity-90"}`}
                    >
                      {noStock ? "لا كروت" : instantMode ? "بيع فوري" : "بيع كرت"}
                    </Button>
                  </div>
                </div>
              </Card>
            );

          })}
        </div>
      )}

      {/* Confirm */}
      <Sheet
        open={!!confirmPkg}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmPkg(null);
            setSelCustomer(null);
            setAddingCustomer(false);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[92vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)]"
          dir="rtl"
        >
          <SheetHeader>
            <SheetTitle>تأكيد البيع</SheetTitle>
            <SheetDescription>لن تظهر بيانات الكرت إلا بعد تأكيد البيع.</SheetDescription>
          </SheetHeader>
          {confirmPkg && (
            <div className="mt-4 space-y-4">
              <div
                className={`rounded-2xl p-5 ${confirmPkg.color ? "text-white" : "pkg-plain"}`}
                style={
                  confirmPkg.color
                    ? {
                        background: `linear-gradient(135deg, ${confirmPkg.color}, ${confirmPkg.color}dd)`,
                      }
                    : undefined
                }
              >
                <div className="opacity-80 text-sm">
                  {confirmPkg.network_name} — {confirmPkg.package_name}
                </div>
                <div className="text-3xl font-extrabold">{fmtMoney(Number(confirmPkg.price))}</div>
              </div>

              {/* Customer picker */}
              <div className="rounded-2xl bg-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground font-semibold">
                    الزبون (اختياري)
                  </div>
                  {!addingCustomer && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-lg h-8"
                      onClick={() => setAddingCustomer(true)}
                    >
                      <UserPlus className="h-4 w-4 ml-1" />
                      زبون جديد
                    </Button>
                  )}
                </div>

                {addingCustomer ? (
                  <div className="space-y-2">
                    <Input aria-label="اسم الزبون"
                      placeholder="اسم الزبون"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="rounded-xl bg-background"
                    />
                    <div
                      className="flex items-stretch rounded-xl bg-background border border-input overflow-hidden"
                      dir="ltr"
                    >
                      <span className="px-3 flex items-center text-sm font-mono bg-muted text-muted-foreground border-l border-input select-none">
                        +967
                      </span>
                      <Input aria-label="7XXXXXXXX"
                        placeholder="7XXXXXXXX"
                        inputMode="tel"
                        value={localYemenDigits(newWa)}
                        onChange={(e) => setNewWa(localYemenDigits(e.target.value))}
                        className="flex-1 rounded-none border-0 bg-background font-mono"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={async () => {
                        const r = await pickContact();
                        if (!r.ok) {
                          if (r.error !== "cancelled")
                            toast.error(r.message ?? "تعذّر جلب جهة الاتصال");
                          return;
                        }
                        if (r.contact?.name) setNewName(r.contact.name);
                        if (r.contact?.phone) setNewWa(localYemenDigits(r.contact.phone));
                      }}
                    >
                      <UserIcon className="h-4 w-4 ml-1" />
                      اختيار من جهات الاتصال
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 rounded-xl"
                        onClick={() => {
                          setAddingCustomer(false);
                          setNewName("");
                          setNewWa("");
                        }}
                      >
                        إلغاء
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 rounded-xl gradient-primary-bg border-0"
                        onClick={async () => {
                          const c = await createCustomer();
                          if (c) setSelCustomer(c);
                        }}
                      >
                        حفظ الزبون
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-destructive mb-1">
                      * اختيار الزبون إلزامي
                    </div>
                    <Popover
                      open={custComboOpen}
                      onOpenChange={setCustComboOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={custComboOpen}
                          className="w-full justify-between rounded-xl bg-background h-10 font-normal"
                        >
                          <span className="truncate">
                            {selCustomer
                              ? `${selCustomer.name} — ${selCustomer.whatsapp}`
                              : (customers?.length ?? 0) === 0
                                ? "لا يوجد زبائن — أضف زبونًا"
                                : "اختر الزبون"}
                          </span>
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[--radix-popover-trigger-width] p-0"
                        align="start"
                        side="bottom"
                        sideOffset={6}
                      >
                        <Command>
                          <CommandInput
                            placeholder="ابحث بالاسم أو الرقم..."
                            value={custSearch}
                            onValueChange={setCustSearch}
                          />
                          <CommandList className="max-h-[45vh]">
                            <CommandEmpty className="py-4 text-xs text-muted-foreground">
                              لا توجد نتائج
                            </CommandEmpty>
                            {filteredCustomers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.name} ${c.whatsapp} ${c.id}`}
                                onSelect={() => {
                                  setSelCustomer(c);
                                  setCustComboOpen(false);
                                  setCustSearch("");
                                }}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="font-bold">{c.name}</span>
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    {c.whatsapp}
                                  </span>
                                </span>
                                {selCustomer?.id === c.id && (
                                  <Check className="mr-auto h-4 w-4 text-primary" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <span>
                  {instantMode && router
                    ? `سيتم إنشاء مستخدم جديد في الميكروتك (${router.name}) وتسجيل المبيعة، ولا يمكن التراجع.`
                    : "سيتم خصم أول كرت من كبينتك ولا يمكن التراجع."}
                  {selCustomer ? ` سيُرسل الكرت إلى ${selCustomer.name} عبر واتساب.` : ""}
                </span>
              </div>
              <div className="flex gap-2 pb-4">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-11"
                  onClick={() => {
                    setConfirmPkg(null);
                    setSelCustomer(null);
                  }}
                >
                  إلغاء
                </Button>
                <Button
                  disabled={selling || !selCustomer}
                  onClick={confirmSell}
                  className="flex-1 rounded-xl h-11 gradient-primary-bg border-0 font-semibold"
                >
                  {selling ? "..." : "تأكيد البيع"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Result */}
      <Sheet open={!!saleResult} onOpenChange={(o) => !o && setSaleResult(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[92vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)]"
          dir="rtl"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-success">
              <Check className="h-5 w-5" />
              تم البيع بنجاح
            </SheetTitle>
          </SheetHeader>
          {saleResult && <SaleReceipt sale={saleResult} />}
        </SheetContent>
      </Sheet>

      {/* Customers management */}
      <Sheet open={customersOpen} onOpenChange={setCustomersOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[92vh] overflow-y-auto"
          dir="rtl"
        >
          <SheetHeader>
            <SheetTitle>الزبائن</SheetTitle>
            <SheetDescription>أضف زبونًا جديدًا أو أدر قائمة زبائنك.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-4">
            <div className="rounded-2xl bg-muted/40 p-3 space-y-2">
              <div className="text-xs text-muted-foreground font-semibold">إضافة زبون جديد</div>
              <Input aria-label="اسم الزبون"
                placeholder="اسم الزبون"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-xl bg-background"
              />
              <div
                className="flex items-stretch rounded-xl bg-background border border-input overflow-hidden"
                dir="ltr"
              >
                <span className="px-3 flex items-center text-sm font-mono bg-muted text-muted-foreground border-l border-input select-none">
                  +967
                </span>
                <Input aria-label="7XXXXXXXX"
                  placeholder="7XXXXXXXX"
                  inputMode="tel"
                  value={localYemenDigits(newWa)}
                  onChange={(e) => setNewWa(localYemenDigits(e.target.value))}
                  className="flex-1 rounded-none border-0 bg-background font-mono"
                />
              </div>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={async () => {
                  const r = await pickContact();
                  if (!r.ok) {
                    if (r.error !== "cancelled") toast.error(r.message ?? "تعذّر جلب جهة الاتصال");
                    return;
                  }
                  if (r.contact?.name) setNewName(r.contact.name);
                  if (r.contact?.phone) setNewWa(localYemenDigits(r.contact.phone));
                }}
              >
                <UserIcon className="h-4 w-4 ml-1" />
                اختيار من جهات الاتصال
              </Button>
              <Button
                className="w-full rounded-xl gradient-primary-bg border-0"
                onClick={() => {
                  void createCustomer();
                }}
              >
                <UserPlus className="h-4 w-4 ml-1" />
                حفظ
              </Button>
            </div>
            <div className="space-y-2">
              {(customers ?? []).map((c) => (
                <Card
                  key={c.id}
                  className="card-elegant border-0 p-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate">{c.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{c.whatsapp}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-lg"
                      onClick={() =>
                        window.open(`https://wa.me/${normalizeWa(c.whatsapp)}`, "_blank")
                      } aria-label="واتساب">
                      <MessageCircle className="h-4 w-4 text-success" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-lg"
                      onClick={() => deleteCustomer(c.id)} aria-label="حذف">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </Card>
              ))}
              {(customers?.length ?? 0) === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  لا يوجد زبائن بعد.
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Package details */}
      <Sheet open={!!detailsPkg} onOpenChange={(o) => !o && setDetailsPkg(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[92vh] overflow-y-auto p-0"
          dir="rtl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>تفاصيل الكروت</SheetTitle>
          </SheetHeader>
          {detailsPkg && user && (
            <PackageDetails
              pkg={detailsPkg}
              agentId={user.id}
              onClose={() => setDetailsPkg(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PackageDetails({
  pkg,
  agentId,
  onClose,
}: {
  pkg: CabinRow;
  agentId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"sold" | "available">("available");
  const [q, setQ] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  // زبون الطباعة: يُربط بالكروت عند "طباعة وتحويل إلى مباع"
  const [printCustomer, setPrintCustomer] = useState<Customer | null>(null);
  const [printCustOpen, setPrintCustOpen] = useState(false);
  const { data: myCustomers } = useQuery({
    queryKey: ["my-customers", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, whatsapp, network_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
  const {
    data: cards,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["cabin-cards", pkg.package_id, agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, username, status, assigned_at, sold_at")
        .eq("package_id", pkg.package_id)
        .or(`assigned_to.eq.${agentId},sold_to.eq.${agentId}`)
        .order("sold_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = (cards ?? []).filter((c) =>
      tab === "sold" ? c.status === "SOLD" : c.status === "ASSIGNED",
    );
    if (tab === "sold") {
      list = [...list].sort((a, b) => {
        const av = a.sold_at ? new Date(a.sold_at).getTime() : 0;
        const bv = b.sold_at ? new Date(b.sold_at).getTime() : 0;
        return bv - av;
      });
    }
    if (!q || tab !== "sold") return list;
    const s = q.toLowerCase();
    return list.filter((c) => c.username.toLowerCase().includes(s));
  }, [cards, tab, q]);

  const available = (cards ?? []).filter((c) => c.status === "ASSIGNED").length;
  const sold = (cards ?? []).filter((c) => c.status === "SOLD").length;

  return (
    <div className="bg-muted/30">
      <div className="p-4 pb-3 flex items-center justify-between gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full h-9 w-9"
          onClick={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["agent-cabin"] });
          }} aria-label="تحديث">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <div className="text-center flex-1">
          <div className="text-[11px] text-muted-foreground">كرتي — كبينة الكروت</div>
          <div className="text-base font-extrabold truncate">{pkg.network_name}</div>
          <div className="text-[11px] text-muted-foreground">{pkg.currency}</div>
        </div>
        <div className="h-10 w-10 rounded-full gradient-primary-bg flex items-center justify-center text-white">
          <Tag className="h-5 w-5" />
        </div>
      </div>

      {tab === "sold" && (
        <div className="px-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input aria-label="ابحث باسم المستخدم..."
              placeholder="ابحث باسم المستخدم..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pr-9 rounded-2xl h-11 bg-background"
            />
          </div>
        </div>
      )}

      <div className="p-4 flex items-center justify-center gap-2">
        <button
          onClick={() => setTab("available")}
          className={`rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-2 border ${tab === "available" ? "bg-card text-foreground border-border" : "bg-transparent text-muted-foreground border-transparent"}`}
        >
          متاحة <span className="rounded-full bg-muted/60 px-1.5 text-[11px]">{available}</span>
        </button>
        <button
          onClick={() => setTab("sold")}
          className={`rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-2 ${tab === "sold" ? "gradient-primary-bg text-white" : "bg-transparent text-muted-foreground"}`}
        >
          مباعة <span className="rounded-full bg-white/25 px-1.5 text-[11px]">{sold}</span>
        </button>
      </div>

      <div className="px-4 pb-6 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {tab === "available" &&
              (() => {
                const availableCodes = (cards ?? [])
                  .filter((c) => c.status === "ASSIGNED")
                  .map((c) => c.username);

                const doPrint = async (autoPrint: boolean) => {
                  try {
                    // تحميل القالب
                    const tpl = loadTemplate(pkg.package_id);
                    if (!tpl) {
                      toast.error("يرجى رفع قالب الطباعة أولاً");
                      setTplOpen(true);
                      return;
                    }
                    if (availableCodes.length === 0) {
                      toast.error("لا توجد كروت متاحة");
                      return;
                    }

                    // محاولة الطباعة مع حماية
                    try {
                      if (autoPrint) {
                        await printCardsPdf({
                          template: tpl,
                          codes: availableCodes,
                          title: `${pkg.network_name} — ${pkg.package_name}`,
                        });
                      } else {
                        await printCards({
                          template: tpl,
                          codes: availableCodes,
                          title: `${pkg.network_name} — ${pkg.package_name}`,
                          autoPrint: false,
                        });
                      }
                    } catch (printErr) {
                      console.error("[doPrint] print failed:", printErr);
                      toast.error("فشلت الطباعة، يرجى المحاولة مجدداً");
                      return;
                    }

                    if (autoPrint) {
                      // تحويل جميع الكروت المتاحة إلى مباع
                      toast.info(`جارٍ تحويل ${availableCodes.length} كرت إلى مباع...`);
                      let ok = 0,
                        fail = 0;
                      for (let i = 0; i < availableCodes.length; i++) {
                        try {
                          const { data, error } = await supabase.rpc("sell_card", {
                            _package_id: pkg.package_id,
                          });
                          if (error) fail++;
                          else {
                            ok++;
                            // ربط العملية بالزبون المختار
                            const sale: any = Array.isArray(data) ? data[0] : data;
                            if (printCustomer && sale?.sale_id) {
                              await supabase
                                .from("sales")
                                .update({
                                  customer_id: printCustomer.id,
                                  buyer_name: printCustomer.name,
                                })
                                .eq("id", sale.sale_id);
                            }
                          }
                        } catch (err) {
                          console.error("[doPrint] sell_card failed:", err);
                          fail++;
                        }
                      }
                      qc.invalidateQueries({ queryKey: ["cabin-cards", pkg.package_id, agentId] });
                      qc.invalidateQueries({ queryKey: ["agent-cabin"] });
                      qc.invalidateQueries({ queryKey: ["sales"] });
                      qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
                      if (fail === 0) toast.success(`تم تحويل ${ok} كرت إلى مباع`);
                      else toast.warning(`تم ${ok} — فشل ${fail}`);
                    }
                  } catch (err) {
                    // حماية نهائية لمنع توقف التطبيق
                    console.error("[doPrint] CRITICAL error:", err);
                    toast.error("حدث خطأ غير متوقع، يرجى المحاولة مجدداً");
                  }
                };

                return (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl h-9"
                      onClick={() => setTplOpen(true)}
                    >
                      <ImageIcon className="h-4 w-4 ml-1" /> قالب الطباعة
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl h-9"
                      disabled={available === 0}
                      onClick={() => doPrint(false)}
                    >
                      <Search className="h-4 w-4 ml-1" /> معاينة ({available})
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-xl h-9 gradient-primary-bg border-0"
                      disabled={available === 0}
                      onClick={() => doPrint(true)}
                    >
                      <Printer className="h-4 w-4 ml-1" /> طباعة وتحويل إلى مباع
                    </Button>
                  </>
                );
              })()}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-card border border-border/50 px-3 py-1 text-xs">
              العملة: {pkg.currency}
            </span>
            <span className="rounded-full bg-card border border-border/50 px-3 py-1 text-xs">
              الشبكة: {pkg.network_name}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">لا توجد كروت.</div>
        ) : (
          filtered.map((c) => (
            <Card key={c.id} className="border-0 card-elegant p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "SOLD" ? "bg-warning/15 text-warning border border-warning/30" : "bg-success/15 text-success border border-success/30"}`}
                >
                  {c.status === "SOLD" ? "مباع" : "متاح"}
                </span>
                <div className="flex items-center gap-2">
                  {c.status === "SOLD" ? (
                    <RevealText username={c.username} />
                  ) : (
                    <span className="font-mono font-extrabold text-base">••••••••</span>
                  )}
                  <UserIcon
                    className={`h-4 w-4 ${c.status === "SOLD" ? "text-success" : "text-muted-foreground"}`}
                  />
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2 flex items-center justify-between text-sm">
                <span className="font-bold">{fmtMoney(Number(pkg.price))}</span>
                <span className="text-muted-foreground">القيمة :</span>
              </div>
              {c.status === "SOLD" && c.sold_at && (
                <div className="rounded-xl bg-muted/50 px-3 py-2 flex items-center justify-between text-sm">
                  <span>{fmtArabicDateTime(c.sold_at)}</span>
                  <span className="text-muted-foreground">تاريخ العملية :</span>
                </div>
              )}
              {c.status === "ASSIGNED" && c.assigned_at && (
                <div className="rounded-xl bg-muted/50 px-3 py-2 flex items-center justify-between text-sm">
                  <span>{fmtArabicDateTime(c.assigned_at)}</span>
                  <span className="text-muted-foreground">تاريخ الاستلام :</span>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border/50 p-3">
        <Button variant="outline" className="w-full rounded-xl h-11" onClick={onClose}>
          إغلاق
        </Button>
      </div>

      <CardTemplateDialog
        open={tplOpen}
        onOpenChange={setTplOpen}
        packageId={pkg.package_id}
        packageName={pkg.package_name}
      />
    </div>
  );
}

function StatMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "primary";
}) {
  const c =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : "bg-primary/10 text-primary";
  return (
    <Card className="card-elegant border-0 p-3 text-center">
      <div className={`text-lg font-extrabold ${c.split(" ")[1]}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </Card>
  );
}

function SaleReceipt({ sale }: { sale: any }) {
  const [buyerName, setBuyerName] = useState<string>(sale.buyer_name ?? "");
  const [savedName, setSavedName] = useState<string>(sale.buyer_name ?? "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`تم نسخ ${label}`);
    } catch (err) {
      console.error("[copy] failed:", err);
      toast.error("فشل النسخ");
    }
  }

  async function saveBuyer() {
    const name = buyerName.trim().slice(0, 120);
    setSaving(true);
    const { error } = await supabase
      .from("sales")
      .update({ buyer_name: name || null })
      .eq("id", sale.sale_id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSavedName(name);
    qc.invalidateQueries({ queryKey: ["sales"] });
    toast.success(name ? "تم حفظ اسم المشتري" : "تم مسح اسم المشتري");
  }

  const fullText = `بيانات الكرت:\n\nاليوزر: ${sale.card_username}\n${sale.card_password ? `كلمة المرور: ${sale.card_password}\n` : ""}الفئة: ${sale.package_name}\nالشبكة: ${sale.network_name}\nالسعر: ${fmtMoney(Number(sale.price))}${savedName ? `\nالمشتري: ${savedName}` : ""}`;

  return (
    <div className="mt-4 space-y-3 pb-4">
      <div className="rounded-2xl border-2 border-dashed border-primary/40 p-5 bg-primary/5 space-y-2">
        <Row label="الشبكة" value={`${sale.network_name} — ${sale.package_name}`} />
        <Row
          label="اسم المستخدم"
          value={sale.card_username}
          onCopy={() => copy(sale.card_username, "اسم المستخدم")}
          hideable
        />
        {sale.card_password && (
          <Row
            label="كلمة المرور"
            value={sale.card_password}
            onCopy={() => copy(sale.card_password, "كلمة المرور")}
            hideable
          />
        )}
        <Row label="السعر" value={fmtMoney(Number(sale.price))} />
        <Row
          label="رقم العملية"
          value={sale.transaction_no}
          onCopy={() => copy(sale.transaction_no, "رقم العملية")}
        />
        {savedName && <Row label="المشتري" value={savedName} />}
      </div>

      <div className="rounded-2xl bg-muted/40 p-3 space-y-2">
        <div className="flex gap-2">
          <Input aria-label="اكتب اسم الشخص الذي تم بيع الكرت له"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="اكتب اسم الشخص الذي تم بيع الكرت له"
            maxLength={120}
            className="rounded-xl h-11 bg-background"
          />
          <Button
            disabled={saving || buyerName.trim() === savedName.trim()}
            onClick={saveBuyer}
            className="rounded-xl h-11 gradient-primary-bg border-0 font-semibold px-4"
          >
            {saving ? "..." : "حفظ"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => copy(fullText, "البيانات")}>
          <Copy className="h-4 w-4 ml-1" />
          نسخ
        </Button>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={async () => {
            try {
              const { isNativeApp } = await import("@/lib/native-pdf");
              if (isNativeApp()) {
                try {
                  const { Share } = await import("@capacitor/share");
                  await Share.share({ text: fullText, dialogTitle: "مشاركة" });
                  return;
                } catch (e) {
                  console.error("[SaleReceipt] Share failed:", e);
                }
              }
              if (navigator.share) {
                try {
                  await navigator.share({ text: fullText });
                } catch (e) {
                  console.error("[SaleReceipt] navigator.share failed:", e);
                  copy(fullText, "البيانات");
                }
              } else {
                copy(fullText, "البيانات");
              }
            } catch (err) {
              console.error("[SaleReceipt] share error:", err);
              toast.error("فشل المشاركة");
            }
          }}
        >
          <Share2 className="h-4 w-4 ml-1" />
          مشاركة
        </Button>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={async () => {
            try {
              const waNumber = sale.customer?.whatsapp
                ? String(sale.customer.whatsapp).replace(/\D/g, "")
                : "";
              const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(fullText)}`;
              const { isNativeApp } = await import("@/lib/native-pdf");
              if (isNativeApp() && !waNumber) {
                try {
                  const { Share } = await import("@capacitor/share");
                  await Share.share({ text: fullText, dialogTitle: "إرسال عبر واتساب" });
                  return;
                } catch (e) {
                  console.error("[SaleReceipt] WhatsApp Share failed:", e);
                }
              }
              window.open(url, "_blank");
            } catch (err) {
              console.error("[SaleReceipt] WhatsApp error:", err);
              toast.error("فشل فتح واتساب");
            }
          }}
        >
          <MessageCircle className="h-4 w-4 ml-1" />
          واتساب{sale.customer?.name ? ` — ${sale.customer.name}` : ""}
        </Button>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={async () => {
            try {
              const esc = (s: any) =>
                String(s ?? "").replace(
                  /[&<>"']/g,
                  (c) =>
                    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
                      c
                    ] as string,
                );
              const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(sale.transaction_no)}</title><style>body{font-family:Cairo,sans-serif;padding:20px;text-align:center;background:#fff}.b{border:2px dashed #009688;border-radius:12px;padding:16px;margin:12px auto;max-width:340px}h1{color:#009688;margin:0 0 8px}.k{color:#666;font-size:12px}.v{font-weight:bold;font-size:18px;margin-bottom:8px}</style></head><body><div class="b"><h1>${esc(sale.network_name)}</h1><div class="k">${esc(sale.package_name)}</div><hr/><div class="k">اسم المستخدم</div><div class="v">${esc(sale.card_username)}</div>${sale.card_password ? `<div class="k">كلمة المرور</div><div class="v">${esc(sale.card_password)}</div>` : ""}<div class="k">السعر</div><div class="v">${esc(fmtMoney(Number(sale.price)))}</div><div class="k" style="margin-top:8px">رقم العملية: ${esc(sale.transaction_no)}</div></div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
              const { openHtmlForPrint } = await import("@/lib/native-pdf");
              await openHtmlForPrint({
                html,
                filename: `فاتورة_${sale.transaction_no}`,
                dialogTitle: "طباعة أو مشاركة الفاتورة",
              });
            } catch (err) {
              console.error("[SaleReceipt] print error:", err);
              toast.error("فشل الطباعة");
            }
          }}
        >
          طباعة
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  hideable,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  hideable?: boolean;
}) {
  const [shown, setShown] = useState(!hideable);
  return (
    <div className="flex items-center justify-between gap-2 bg-background rounded-lg p-2.5">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-mono font-bold truncate">
          {shown ? value : "•".repeat(Math.max(6, Math.min(12, value.length)))}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {hideable && (
          <Button
            size="icon"
            variant="ghost"
            className="rounded-lg"
            onClick={() => setShown((s) => !s)}
            title={shown ? "إخفاء" : "إظهار"} aria-label="إخفاء">
            {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        {onCopy && shown && (
          <Button size="icon" variant="ghost" className="rounded-lg" onClick={onCopy} aria-label="نسخ">
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
