import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Plus, Wifi, ArrowRight, Edit3, Trash2, ShieldAlert, Check, Copy, Share2, MessageCircle, Layers, Archive, CalendarCheck, Clock3, RotateCw, ShoppingCart, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/app/networks/$id")({ component: PackagesPage });

const pkgSchema = z.object({
  name: z.string().trim().min(2).max(80),
  price: z.number().nonnegative(),
  data_size: z.string().trim().max(40).optional().nullable(),
  speed: z.string().trim().max(40).optional().nullable(),
  validity: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(240).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#009688"),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
type PkgForm = z.infer<typeof pkgSchema>;

function PackagesPage() {
  const { id: networkId } = Route.useParams();
  const { role, session, loading: authLoading } = useAuth();
  const isAdmin = role === "admin";
  const authReady = !authLoading && !!session;
  const qc = useQueryClient();

  const { data: network } = useQuery({
    queryKey: ["network", networkId, session?.user?.id],
    enabled: authReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("networks").select("*").eq("id", networkId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: packages, isLoading: pkgsLoading } = useQuery({
    queryKey: ["packages", networkId, session?.user?.id],
    enabled: authReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("packages")
        .select("id, name, price, data_size, speed, validity, allowed_time, description, color, sort_order, is_active")
        .eq("network_id", networkId).order("sort_order").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["pkg-counts", networkId, session?.user?.id],
    enabled: authReady,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("package_counts", { _network_id: networkId });
      const m = new Map<string, { avail: number; sold: number }>();
      if (error || !data) return m;
      for (const r of data as any[]) {
        m.set(r.package_id, { avail: r.available ?? 0, sold: r.sold ?? 0 });
      }
      return m;
    },
  });


  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const savePkg = useMutation({
    mutationFn: async (form: PkgForm) => {
      const payload = { ...form, network_id: networkId };
      if (editing) {
        const { error } = await supabase.from("packages").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("packages").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم التحديث" : "تم إنشاء الباقة");
      qc.invalidateQueries({ queryKey: ["packages", networkId] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delPkg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("packages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["packages", networkId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sell flow state
  const [confirmPkg, setConfirmPkg] = useState<any>(null);
  const [saleResult, setSaleResult] = useState<any>(null);
  const [selling, setSelling] = useState(false);
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
    if (error) { toast.error(error.message); return; }
    toast.success("تم إرسال الطلب — بانتظار موافقة المدير", { duration: 2000 });
    setRequestPkg(null); setReqQty(10); setReqNotes(""); setReqPayment("CREDIT");
    qc.invalidateQueries({ queryKey: ["my-requests"] });
    qc.invalidateQueries({ queryKey: ["card-requests"] });
  }

  async function confirmSell() {
    if (!confirmPkg) return;
    setSelling(true);
    const { data, error } = await supabase.rpc("sell_card", { _package_id: confirmPkg.id });
    setSelling(false);
    if (error) {
      const map: Record<string, string> = {
        NO_CARDS_AVAILABLE: "لا توجد كروت متوفرة لهذه الباقة",
        ACCOUNT_INACTIVE: "حسابك غير مفعّل",
        FORBIDDEN: "غير مصرح",
        PACKAGE_NOT_FOUND: "الباقة غير موجودة",
        NETWORK_INACTIVE: "الشبكة موقوفة",
      };
      const key = Object.keys(map).find((k) => error.message.includes(k));
      toast.error(key ? map[key] : error.message);
      return;
    }
    setConfirmPkg(null);
    setSaleResult(Array.isArray(data) ? data[0] : data);
    qc.invalidateQueries({ queryKey: ["pkg-counts", networkId] });
    qc.invalidateQueries({ queryKey: ["my-sales-stats"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
  }

  return (
    <>
      <div className="mb-6">
        <Link to="/app/networks" className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-3">
          <ArrowRight className="h-3.5 w-3.5" /> عودة للشبكات
        </Link>
        <PageHeader
          title={network?.name ?? "الباقات"}
          description={network?.description ?? undefined}
          action={isAdmin ? (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button className="rounded-xl gradient-primary-bg border-0 font-semibold"><Plus className="h-4 w-4 ml-1" />إضافة باقة</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-3xl" dir="rtl">
                <DialogHeader><DialogTitle>{editing ? "تعديل باقة" : "إضافة باقة جديدة"}</DialogTitle></DialogHeader>
                <PackageForm initial={editing} onSubmit={(v) => savePkg.mutate(v)} busy={savePkg.isPending} />
              </DialogContent>
            </Dialog>
          ) : undefined}
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages?.map((p) => {
          const c = counts?.get(p.id) ?? { avail: 0, sold: 0 };
          const noStock = c.avail === 0;
          const packageCode = String(p.id).split("-")[0].toUpperCase();
          return (
            <Card key={p.id} className="card-elegant card-elegant-hover border-0 overflow-hidden slide-up p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-xl gradient-primary-bg flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-extrabold text-xl leading-tight truncate">باقة {p.name}</h2>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{p.description}</p>}
                  </div>
                </div>
                <div className="rounded-full border bg-accent px-3 py-1 text-sm font-bold text-accent-foreground shrink-0">
                  {network?.currency} {fmtMoney(Number(p.price))}
                </div>
              </div>

              <div className="rounded-xl bg-muted/70 border p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Archive className="h-5 w-5 text-primary" />
                  <span className="text-sm">المتاح الآن</span>
                </div>
                <div className="text-4xl font-extrabold tracking-normal">{c.avail}</div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <PackageInfo icon={CalendarCheck} label="الصلاحية" value={p.validity || "—"} />
                <PackageInfo icon={Clock3} label="الساعات" value={p.allowed_time || "مفتوح"} />
                <PackageInfo icon={RotateCw} label="الحجم" value={p.data_size || "—"} />
              </div>

              <div className="flex justify-end">
                <div className="rounded-xl border bg-muted/70 px-3 py-1.5 text-sm text-muted-foreground">ID: {packageCode}</div>
              </div>

              <div className="flex gap-2">
                {isAdmin ? (
                  <>
                    <Button disabled={noStock || !p.is_active} onClick={() => setConfirmPkg(p)}
                      className="flex-1 rounded-xl gradient-primary-bg border-0 font-semibold h-11">
                      {noStock ? "نفدت الكروت" : "بيع"}
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl h-11 w-11" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl h-11 w-11 text-destructive"
                      onClick={() => { if (confirm(`حذف "${p.name}"؟`)) delPkg.mutate(p.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button disabled={!p.is_active} onClick={() => setRequestPkg(p)}
                      variant="outline" className="flex-1 rounded-xl h-11 border-primary text-primary font-semibold">
                      <ShoppingCart className="h-4 w-4 ml-1" />طلب سحب
                    </Button>
                    <Button asChild variant="outline" className="flex-1 rounded-xl h-11 border-primary text-primary font-semibold">
                      <Link to="/app/cabin"><LayoutGrid className="h-4 w-4 ml-1" />كبينة البيع</Link>
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
        {(!packages || pkgsLoading) && (
          <div className="col-span-full text-center py-16 text-muted-foreground text-sm">جاري التحميل...</div>
        )}
        {packages && !pkgsLoading && packages.length === 0 && (
          <div className="col-span-full text-center py-16 space-y-4">
            <div className="text-muted-foreground">لا توجد باقات في هذه الشبكة.</div>
            {isAdmin && (
              <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl gradient-primary-bg border-0 font-semibold">
                <Plus className="h-4 w-4 ml-1" />إضافة أول باقة
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Confirm sale sheet */}
      <Sheet open={!!confirmPkg} onOpenChange={(o) => !o && setConfirmPkg(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl" dir="rtl">
          <SheetHeader>
            <SheetTitle>تأكيد البيع</SheetTitle>
            <SheetDescription>لن تظهر بيانات الكرت إلا بعد تأكيد البيع.</SheetDescription>
          </SheetHeader>
          {confirmPkg && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${confirmPkg.color}, ${confirmPkg.color}dd)` }}>
                <div className="opacity-80 text-sm">{confirmPkg.name}</div>
                <div className="text-3xl font-extrabold">{fmtMoney(Number(confirmPkg.price))} <span className="text-sm font-normal opacity-70">{network?.currency}</span></div>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <span>عند التأكيد، سيتم خصم أول كرت متوفر ولا يمكن التراجع.</span>
              </div>
              <div className="flex gap-2 pb-4">
                <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setConfirmPkg(null)}>إلغاء</Button>
                <Button disabled={selling} onClick={confirmSell} className="flex-1 rounded-xl h-11 gradient-primary-bg border-0 font-semibold">
                  {selling ? "..." : "تأكيد البيع"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Result sheet */}
      <Sheet open={!!saleResult} onOpenChange={(o) => !o && setSaleResult(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-success"><Check className="h-5 w-5" />تم البيع بنجاح</SheetTitle>
          </SheetHeader>
          {saleResult && <SaleCard sale={saleResult} currency={network?.currency ?? ""} networkName={network?.name ?? ""} />}
        </SheetContent>
      </Sheet>


      {/* Request cards sheet (agent) */}
      <Sheet open={!!requestPkg} onOpenChange={(o) => !o && setRequestPkg(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl" dir="rtl">
          <SheetHeader>
            <SheetTitle>طلب كروت من المدير</SheetTitle>
            <SheetDescription>اختر الكمية المطلوبة — سيتم تنزيل الكروت إلى كبينتك بعد الموافقة.</SheetDescription>
          </SheetHeader>
          {requestPkg && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${requestPkg.color}, ${requestPkg.color}dd)` }}>
                <div className="opacity-80 text-sm">{requestPkg.name}</div>
                <div className="text-3xl font-extrabold">{fmtMoney(Number(requestPkg.price))} <span className="text-sm font-normal opacity-70">{network?.currency}</span></div>
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
                  {fmtMoney(Number(requestPkg.price) * reqQty)} <span className="text-xs font-normal opacity-70">{network?.currency}</span>
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
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PackageInfo({ icon: Icon, label, value }: { icon: typeof Wifi; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 border p-3 min-h-24 flex flex-col items-center justify-center gap-1">
      <Icon className="h-4 w-4 text-primary" />
      <div className="font-extrabold text-lg leading-tight break-words max-w-full text-center">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SaleCard({ sale, currency, networkName }: { sale: any; currency: string; networkName: string }) {
  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text); toast.success(`تم نسخ ${label}`);
  }
  const fullText = `الشبكة: ${networkName}\nالباقة: ${sale.package_name}\nالمستخدم: ${sale.card_username}\n${sale.card_password ? `كلمة المرور: ${sale.card_password}\n` : ""}السعر: ${fmtMoney(Number(sale.price))} ${currency}\nرقم العملية: ${sale.transaction_no}`;

  async function share() {
    // Native → share sheet (WhatsApp, Telegram, Gmail…). Web → navigator.share or copy.
    const { isNativeApp } = await import("@/lib/native-pdf");
    if (isNativeApp()) {
      try {
        const { Share } = await import("@capacitor/share");
        await Share.share({ text: fullText, dialogTitle: "مشاركة تفاصيل البيع" });
        return;
      } catch (e) { console.error(e); }
    }
    if (navigator.share) navigator.share({ text: fullText }).catch(() => {});
    else copy(fullText, "البيانات");
  }
  async function whatsapp() {
    const { isNativeApp } = await import("@/lib/native-pdf");
    if (isNativeApp()) {
      try {
        const { Share } = await import("@capacitor/share");
        await Share.share({ text: fullText, dialogTitle: "إرسال عبر واتساب" });
        return;
      } catch (e) { console.error(e); }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, "_blank");
  }
  async function print() {
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const tx = esc(sale.transaction_no);
    const pkg = esc(sale.package_name);
    const net = esc(networkName);
    const user = esc(sale.card_username);
    const pass = sale.card_password ? esc(sale.card_password) : "";
    const price = esc(`${fmtMoney(Number(sale.price))} ${currency}`);
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${tx}</title><style>body{font-family:Cairo,sans-serif;padding:20px;text-align:center;background:#fff}.b{border:2px dashed #009688;border-radius:12px;padding:16px;margin:12px auto;max-width:320px}h1{color:#009688;margin:0 0 8px}.k{color:#666;font-size:12px}.v{font-weight:bold;font-size:18px;margin-bottom:8px}</style></head><body><div class="b"><h1>${net}</h1><div class="k">${pkg}</div><hr/><div class="k">اسم المستخدم</div><div class="v">${user}</div>${pass?`<div class="k">كلمة المرور</div><div class="v">${pass}</div>`:""}<div class="k">السعر</div><div class="v">${price}</div><div class="k" style="margin-top:8px">رقم العملية: ${tx}</div></div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
    const { sharePdfOrPrint } = await import("@/lib/native-pdf");
    await sharePdfOrPrint({ html, filename: `فاتورة_${sale.transaction_no}`, dialogTitle: "طباعة أو مشاركة الفاتورة" });
  }

  return (
    <div className="mt-4 space-y-3 pb-4">
      <div className="rounded-2xl border-2 border-dashed border-primary/40 p-5 bg-primary/5">
        <div className="text-xs text-muted-foreground">الشبكة</div>
        <div className="font-bold mb-2">{networkName} — {sale.package_name}</div>
        <div className="grid gap-2">
          <Row label="اسم المستخدم" value={sale.card_username} onCopy={() => copy(sale.card_username, "اسم المستخدم")} />
          {sale.card_password && <Row label="كلمة المرور" value={sale.card_password} onCopy={() => copy(sale.card_password, "كلمة المرور")} />}
          <Row label="السعر" value={`${fmtMoney(Number(sale.price))} ${currency}`} />
          <Row label="رقم العملية" value={sale.transaction_no} onCopy={() => copy(sale.transaction_no, "رقم العملية")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => copy(fullText, "البيانات كاملة")}><Copy className="h-4 w-4 ml-1" />نسخ الكل</Button>
        <Button variant="outline" className="rounded-xl" onClick={share}><Share2 className="h-4 w-4 ml-1" />مشاركة</Button>
        <Button variant="outline" className="rounded-xl" onClick={whatsapp}><MessageCircle className="h-4 w-4 ml-1" />واتساب</Button>
        <Button variant="outline" className="rounded-xl" onClick={print}>طباعة</Button>
      </div>
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-background rounded-lg p-2.5">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-mono font-bold truncate">{value}</div>
      </div>
      {onCopy && <Button size="icon" variant="ghost" className="rounded-lg shrink-0" onClick={onCopy}><Copy className="h-4 w-4" /></Button>}
    </div>
  );
}

function PackageForm({ initial, onSubmit, busy }: { initial: any; onSubmit: (v: PkgForm) => void; busy: boolean }) {
  const [form, setForm] = useState<PkgForm>({
    name: initial?.name ?? "",
    price: Number(initial?.price ?? 0),
    data_size: initial?.data_size ?? "",
    speed: initial?.speed ?? "",
    validity: initial?.validity ?? "",
    description: initial?.description ?? "",
    color: initial?.color ?? "#009688",
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = pkgSchema.safeParse(form);
    if (!p.success) return toast.error(p.error.issues[0].message);
    onSubmit(p.data);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">اسم الباقة</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="باقة يومية" /></div>
        <div><Label className="text-xs">السعر (ريال)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="50" /></div>
        <div><Label className="text-xs">حجم الباقة / الرصيد</Label><Input value={form.data_size ?? ""} onChange={(e) => setForm({ ...form, data_size: e.target.value })} placeholder="50 GB" /></div>
        <div><Label className="text-xs">السرعة</Label><Input value={form.speed ?? ""} onChange={(e) => setForm({ ...form, speed: e.target.value })} placeholder="20 Mbps" /></div>
        <div><Label className="text-xs">مدة الصلاحية</Label><Input value={form.validity ?? ""} onChange={(e) => setForm({ ...form, validity: e.target.value })} placeholder="30 يوم" /></div>
        <div><Label className="text-xs">اللون</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" /></div>
      </div>
      <div><Label className="text-xs">الوصف</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
        <Label className="text-sm">تفعيل الباقة</Label>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
      </div>
      <DialogFooter><Button type="submit" disabled={busy} className="w-full rounded-xl gradient-primary-bg border-0">{busy ? "..." : "حفظ"}</Button></DialogFooter>
    </form>
  );
}
