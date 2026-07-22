import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Package as PackageIcon, Edit3, Trash2, Layers, Clock, CalendarCheck, RefreshCw, Archive, ShoppingCart, LayoutGrid } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/app/packages")({ component: PackagesPage });

const pkgSchema = z.object({
  network_id: z.string().uuid("اختر الشبكة"),
  name: z.string().trim().min(2, "أدخل اسم الباقة").max(80),
  price: z.number().nonnegative(),
  data_size: z.string().trim().max(40).optional().nullable(),
  speed: z.string().trim().max(40).optional().nullable(),
  validity: z.string().trim().max(40).optional().nullable(),
  allowed_time: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(240).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#009688"),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
type PkgForm = z.infer<typeof pkgSchema>;

function PackagesPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const { data: networks } = useQuery({
    queryKey: ["networks-all"],
    queryFn: async () => (await supabase.from("networks").select("id, name, currency").order("name")).data ?? [],
  });

  const [filterNet, setFilterNet] = useState<string>("all");

  const { data: packages } = useQuery({
    queryKey: ["packages-all", filterNet],
    queryFn: async () => {
      let q = supabase.from("packages")
        .select("id, network_id, name, price, data_size, speed, validity, allowed_time, description, color, sort_order, is_active")
        .order("price", { ascending: false });
      if (filterNet !== "all") q = q.eq("network_id", filterNet);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["packages-counts-all", networks?.map((n) => n.id).join(",") ?? ""],
    enabled: !!networks && networks.length > 0,
    queryFn: async () => {
      const m = new Map<string, { avail: number; assigned: number; sold: number }>();
      if (!networks) return m;
      const results = await Promise.all(
        networks.map((n) => supabase.rpc("package_counts", { _network_id: n.id }))
      );
      for (const r of results) {
        if (r.error || !r.data) continue;
        for (const row of r.data as any[]) {
          m.set(row.package_id, {
            avail: row.available ?? 0,
            assigned: row.assigned ?? 0,
            sold: row.sold ?? 0,
          });
        }
      }
      return m;
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const save = useMutation({
    mutationFn: async (form: PkgForm) => {
      if (editing) {
        const { error } = await supabase.from("packages").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("packages").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم التحديث" : "تم إنشاء الباقة");
      qc.invalidateQueries({ queryKey: ["packages-all"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (p: { id: string; name: string }) => {
      const { error } = await supabase.from("packages").delete().eq("id", p.id);
      if (error) throw Object.assign(new Error(error.message), { code: (error as any).code, pkg: p });
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["packages-all"] });
      qc.invalidateQueries({ queryKey: ["packages-counts-all"] });
    },
    onError: async (e: any) => {
      const msg = String(e?.message ?? "");
      const isFk = e?.code === "23503" || /foreign key|violates/i.test(msg);
      if (!isFk) return toast.error(msg);
      const p = e.pkg as { id: string; name: string };
      const ok = confirm(
        `لا يمكن حذف الباقة "${p.name}" لأنها مرتبطة بمبيعات سابقة.\n\nهل تريد تعطيلها بدلاً من الحذف؟ (ستختفي من قوائم البيع مع الحفاظ على سجل المبيعات)`
      );
      if (!ok) return;
      const { error } = await supabase.from("packages").update({ is_active: false }).eq("id", p.id);
      if (error) return toast.error(error.message);
      toast.success("تم تعطيل الباقة");
      qc.invalidateQueries({ queryKey: ["packages-all"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
    },
  });

  const netMap = new Map(networks?.map((n) => [n.id, n]) ?? []);

  // Request cards flow
  const [requestPkg, setRequestPkg] = useState<any>(null);
  const [reqQty, setReqQty] = useState<number>(10);
  const [reqNotes, setReqNotes] = useState("");
  const [reqPayment, setReqPayment] = useState<"CREDIT" | "CASH">("CREDIT");
  const [reqBusy, setReqBusy] = useState(false);

  async function submitRequest() {
    if (!requestPkg) return;
    const avail = counts?.get(requestPkg.id)?.avail ?? 0;
    if (reqQty > avail) {
      toast.error(`لا يمكن الطلب أكثر من المتاح (${avail})، وأنت طلبت ${reqQty}`);
      return;
    }
    setReqBusy(true);
    const { error } = await supabase.rpc("request_cards", {
      _package_id: requestPkg.id, _quantity: reqQty, _notes: reqNotes, _payment_method: reqPayment,
    });
    setReqBusy(false);
    if (error) {
      const map: Record<string, string> = {
        FORBIDDEN: "غير مصرح",
        ACCOUNT_INACTIVE: "حسابك غير مفعّل",
        PACKAGE_NOT_FOUND: "الباقة غير موجودة",
        PACKAGE_NOT_IN_YOUR_NETWORK: "هذه الباقة ليست ضمن شبكتك",
        AGENT_NETWORK_NOT_SET: "لم يتم تعيين شبكتك بعد",
        INVALID_QUANTITY: "كمية غير صحيحة",
      };
      toast.error(map[error.message] ?? error.message);
      return;
    }
    toast.success("تم إرسال الطلب — بانتظار موافقة المدير");
    setRequestPkg(null); setReqQty(10); setReqNotes(""); setReqPayment("CREDIT");
    qc.invalidateQueries({ queryKey: ["my-requests"] });
    qc.invalidateQueries({ queryKey: ["card-requests"] });
    qc.invalidateQueries({ queryKey: ["packages-counts-all"] });
  }


  return (
    <>
      <PageHeader
        title="الباقات"
        description="إدارة كل الباقات عبر الشبكات"
      action={
        isAdmin ? (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gradient-primary-bg border-0 font-semibold">
                <Plus className="h-4 w-4 ml-1" />إضافة باقة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl" dir="rtl">
              <DialogHeader><DialogTitle>{editing ? "تعديل باقة" : "إضافة باقة جديدة"}</DialogTitle></DialogHeader>
              <PackageForm
                initial={editing}
                networks={networks ?? []}
                onSubmit={(v) => save.mutate(v)}
                busy={save.isPending}
              />
            </DialogContent>
          </Dialog>
        ) : undefined
      }
      />

      <div className="mb-4 max-w-xs">
        <Label className="text-xs mb-1.5 block">تصفية حسب الشبكة</Label>
        <Select value={filterNet} onValueChange={setFilterNet}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الشبكات</SelectItem>
            {networks?.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages?.map((p) => {
          const net = netMap.get(p.network_id);
          const c = counts?.get(p.id) ?? { total: 0, avail: 0, assigned: 0, sold: 0 };
          const shortId = p.id.replace(/-/g, "").slice(0, 8).toUpperCase();
          return (
            <Card key={p.id} className="card-elegant border border-border/40 bg-card rounded-3xl p-4 space-y-3">
              {/* Header: icon + name + price pill */}
              <div className="flex items-center justify-between gap-3">
                <div
                  className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ background: p.color ?? "#009688" }}
                >
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-base font-extrabold truncate">باقة {p.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{net?.name ?? "—"}</div>
                </div>
                <div className="rounded-full bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 whitespace-nowrap">
                  {fmtMoney(Number(p.price))} {net?.currency ?? "ر.س"}
                </div>
              </div>

              {/* Available now */}
              <div className="rounded-2xl bg-muted/50 px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  المتاح الآن
                </div>
                <div className="text-2xl font-extrabold text-foreground">{c.avail}</div>
              </div>

              {/* Three feature tiles */}
              <div className="grid grid-cols-3 gap-2">
                <FeatureTile icon={<CalendarCheck className="h-4 w-4" />} value={p.validity ?? "—"} label="الصلاحية" />
                <FeatureTile icon={<Clock className="h-4 w-4" />} value={p.allowed_time ?? "—"} label="الساعات" />
                <FeatureTile icon={<RefreshCw className="h-4 w-4" />} value={p.data_size ?? "—"} label="الحجم" />
              </div>

              {/* ID chip */}
              <div className="flex">
                <span className="inline-flex items-center rounded-full bg-muted/60 text-muted-foreground text-[11px] font-medium px-3 py-1">
                  ID: {shortId}
                </span>
              </div>

              {/* Actions */}
              {isAdmin ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => { setEditing(p); setOpen(true); }}>
                    <Edit3 className="h-4 w-4 ml-1" />تعديل
                  </Button>
                  <Button variant="outline" size="icon" className="rounded-xl text-destructive"
                    onClick={() => { if (confirm(`حذف "${p.name}"؟`)) del.mutate({ id: p.id, name: p.name }); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl border-primary/40 text-primary hover:bg-primary/5 h-11 font-semibold"
                    onClick={() => { setRequestPkg(p); setReqQty(10); setReqNotes(""); setReqPayment("CREDIT"); }}
                  >
                    <ShoppingCart className="h-4 w-4 ml-1.5" />طلب سحب
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl border-primary/40 text-primary hover:bg-primary/5 h-11 font-semibold">
                    <Link to="/app/cabin"><LayoutGrid className="h-4 w-4 ml-1.5" />كبينة البيع</Link>
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {packages?.length === 0 && (
          <div className="col-span-full text-center py-16 space-y-4">
            <PackageIcon className="h-10 w-10 text-muted-foreground mx-auto" />
            <div className="text-muted-foreground">لا توجد باقات بعد.</div>
            {isAdmin && (
              <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl gradient-primary-bg border-0 font-semibold">
                <Plus className="h-4 w-4 ml-1" />إضافة أول باقة
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Request cards sheet (agent) */}
      <Sheet open={!!requestPkg} onOpenChange={(o) => !o && setRequestPkg(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl" dir="rtl">
          <SheetHeader>
            <SheetTitle>طلب كروت من المدير</SheetTitle>
            <SheetDescription>اختر الكمية المطلوبة — سيتم تنزيل الكروت إلى كبينتك بعد الموافقة.</SheetDescription>
          </SheetHeader>
          {requestPkg && (() => {
            const net = netMap.get(requestPkg.network_id);
            return (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${requestPkg.color ?? "#009688"}, ${(requestPkg.color ?? "#009688")}dd)` }}>
                  <div className="opacity-80 text-sm">{net?.name ?? ""}</div>
                  <div className="text-base font-bold">{requestPkg.name}</div>
                  <div className="text-3xl font-extrabold mt-1">{fmtMoney(Number(requestPkg.price))} <span className="text-sm font-normal opacity-70">{net?.currency}</span></div>
                  <div className="text-xs opacity-80 mt-1">المتاح الآن: {counts?.get(requestPkg.id)?.avail ?? 0}</div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">الكمية المطلوبة</Label>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="rounded-xl h-11 w-11" onClick={() => setReqQty(Math.max(1, reqQty - 1))}>−</Button>
                    <Input type="number" min={1} max={10000} value={reqQty}
                      onChange={(e) => setReqQty(Math.max(1, Number(e.target.value) || 1))}
                      className="h-11 rounded-xl text-center text-lg font-bold" />
                    <Button type="button" variant="outline" className="rounded-xl h-11 w-11" onClick={() => setReqQty(reqQty + 1)}>+</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[5,10,20,50,100].map((n) => (
                      <button type="button" key={n} onClick={() => setReqQty(n)}
                        className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70">{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">طريقة الدفع</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setReqPayment("CASH")}
                      className={`rounded-xl h-11 font-semibold border-2 transition ${reqPayment === "CASH" ? "border-success bg-success/10 text-success" : "border-muted bg-muted/40 text-muted-foreground"}`}>
                      نقد
                    </button>
                    <button type="button" onClick={() => setReqPayment("CREDIT")}
                      className={`rounded-xl h-11 font-semibold border-2 transition ${reqPayment === "CREDIT" ? "border-warning bg-warning/10 text-warning" : "border-muted bg-muted/40 text-muted-foreground"}`}>
                      آجل
                    </button>
                  </div>
                </div>
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">القيمة الإجمالية</span>
                  <span className="font-extrabold text-primary text-base">
                    {fmtMoney(Number(requestPkg.price) * reqQty)} <span className="text-xs font-normal opacity-70">{net?.currency}</span>
                  </span>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">ملاحظات (اختياري)</Label>
                  <Textarea rows={2} value={reqNotes} onChange={(e) => setReqNotes(e.target.value)}
                    placeholder="مثلاً: عاجل، للاستهلاك اليومي..." className="rounded-xl" />
                </div>
                <div className="flex gap-2 pb-4">
                  <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setRequestPkg(null)}>إلغاء</Button>
                  <Button disabled={reqBusy} onClick={submitRequest}
                    className="flex-1 rounded-xl h-11 gradient-primary-bg border-0 font-semibold">
                    {reqBusy ? "..." : `إرسال الطلب (${reqQty})`}
                  </Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PackageForm({ initial, networks, onSubmit, busy }: {
  initial: any; networks: { id: string; name: string }[]; onSubmit: (v: PkgForm) => void; busy: boolean;
}) {
  const [form, setForm] = useState<PkgForm>({
    network_id: initial?.network_id ?? "",
    name: initial?.name ?? "",
    price: Number(initial?.price ?? 0),
    data_size: initial?.data_size ?? "",
    speed: initial?.speed ?? "",
    validity: initial?.validity ?? "",
    allowed_time: initial?.allowed_time ?? "",
    description: initial?.description ?? "",
    color: initial?.color ?? "#009688",
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  });
  const [priceInput, setPriceInput] = useState<string>(
    initial?.price != null ? String(initial.price) : ""
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = pkgSchema.safeParse(form);
    if (!p.success) return toast.error(p.error.issues[0].message);
    onSubmit(p.data);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label className="text-xs mb-1.5 block">الشبكة</Label>
        <Select value={form.network_id} onValueChange={(v) => setForm({ ...form, network_id: v })}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر الشبكة" /></SelectTrigger>
          <SelectContent>
            {networks.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">اسم الباقة</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="باقة يومية" /></div>
        <div><Label className="text-xs">السعر (ريال)</Label><Input type="number" step="0.01" inputMode="decimal" value={priceInput} onChange={(e) => { const v = e.target.value; setPriceInput(v); setForm({ ...form, price: v === "" ? 0 : Number(v) }); }} placeholder="50" /></div>
        <div><Label className="text-xs">حجم الباقة</Label><Input value={form.data_size ?? ""} onChange={(e) => setForm({ ...form, data_size: e.target.value })} placeholder="50 GB" /></div>
        <div><Label className="text-xs">السرعة</Label><Input value={form.speed ?? ""} onChange={(e) => setForm({ ...form, speed: e.target.value })} placeholder="20 Mbps" /></div>
        <div><Label className="text-xs">مدة الصلاحية</Label><Input value={form.validity ?? ""} onChange={(e) => setForm({ ...form, validity: e.target.value })} placeholder="30 يوم" /></div>
        <div>
          <Label className="text-xs">اللون</Label>
          <div className="flex items-center gap-2">
            <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-14 p-1 h-10" />
            <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl text-xs" onClick={() => setForm({ ...form, color: "#009688" })}>
              استعادة الافتراضي
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["#009688","#0ea5e9","#6366f1","#8b5cf6","#ec4899","#ef4444","#f59e0b","#10b981","#14b8a6","#64748b"].map((c) => (
              <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className="w-6 h-6 rounded-full border-2 border-white shadow ring-1 ring-border" style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <div className="col-span-2"><Label className="text-xs">الوقت المسموح</Label><Input value={form.allowed_time ?? ""} onChange={(e) => setForm({ ...form, allowed_time: e.target.value })} placeholder="مثال: 4 ساعات يومياً" /></div>
      </div>
      <div><Label className="text-xs">وصف (اختياري)</Label><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
        <div className="text-sm">مفعّلة</div>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
      </div>
      <Button type="submit" disabled={busy} className="w-full h-11 rounded-xl gradient-primary-bg border-0 font-semibold">
        {busy ? "..." : (initial ? "حفظ التعديلات" : "إضافة الباقة")}
      </Button>
    </form>
  );
}

function FeatureTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-muted/40 border border-border/40 px-2 py-2.5 text-center">
      <div className="flex items-center justify-center text-primary mb-1">{icon}</div>
      <div className="text-sm font-extrabold text-foreground leading-tight truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
