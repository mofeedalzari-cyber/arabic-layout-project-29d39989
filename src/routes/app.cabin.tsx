import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Wifi, ShieldAlert, Check, Copy, Share2, MessageCircle, PackageOpen, Tag, RefreshCw, Search, User as UserIcon, Printer, Image as ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney, fmtArabicDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { CardTemplateDialog } from "@/components/card-template-dialog";
import { loadTemplate, printCards, printCardsPdf } from "@/lib/card-print";

export const Route = createFileRoute("/app/cabin")({ component: CabinPage });


interface CabinRow {
  package_id: string; package_name: string;
  network_id: string; network_name: string;
  price: number; color: string;
  data_size: string | null; speed: string | null; validity: string | null;
  currency: string; available: number; sold_count: number;
}

function CabinPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["agent-cabin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agent_cabin");
      if (error) throw error;
      return (data ?? []) as CabinRow[];
    },
  });

  const [confirmPkg, setConfirmPkg] = useState<CabinRow | null>(null);
  const [saleResult, setSaleResult] = useState<any>(null);
  const [selling, setSelling] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState<CabinRow | null>(null);


  async function confirmSell() {
    if (!confirmPkg) return;
    setSelling(true);
    const { data, error } = await supabase.rpc("sell_card", { _package_id: confirmPkg.package_id });
    setSelling(false);
    if (error) {
      const map: Record<string, string> = {
        NO_CARDS_AVAILABLE: "لا توجد كروت في كبينتك لهذه الباقة",
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

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatMini label="متوفر" value={String(totalAvail)} tone="success" />
        <StatMini label="مباع" value={String(totalSold)} tone="warning" />
        <StatMini label="قيمة المتاح" value={fmtMoney(totalValue)} tone="primary" />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جارٍ التحميل...</div>
      ) : (rows?.length ?? 0) === 0 ? (
        <div className="text-center py-16 space-y-3">
          <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground" />
          <div className="text-muted-foreground">لا توجد كروت في كبينتك بعد.</div>
          <div className="text-xs text-muted-foreground">اذهب إلى الشبكات واطلب كروت من المدير.</div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows!.map((r) => {
            const noStock = r.available === 0;
            return (
              <Card key={r.package_id} className="card-elegant border-0 overflow-hidden p-0">
                <div className="p-5 relative" style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}dd)` }}>
                  <Wifi className="absolute top-3 left-3 h-5 w-5 text-white/40" />
                  <div className="text-white/80 text-[11px] mb-1">{r.network_name}</div>
                  <div className="text-white text-sm mb-1">{r.package_name}</div>
                  <div className="text-white text-2xl font-extrabold">
                    {fmtMoney(Number(r.price))}
                    <span className="text-xs font-normal opacity-70 mr-1">{r.currency}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-white/90">
                    {r.data_size && <span className="bg-white/20 px-2 py-0.5 rounded-full">{r.data_size}</span>}
                    {r.speed && <span className="bg-white/20 px-2 py-0.5 rounded-full">{r.speed}</span>}
                    {r.validity && <span className="bg-white/20 px-2 py-0.5 rounded-full">{r.validity}</span>}
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-2 text-center text-xs mb-3">
                    <button type="button" onClick={() => setDetailsPkg(r)} className="rounded-lg bg-success/10 py-1.5 hover:bg-success/15 transition">
                      <div className="font-bold text-success text-lg">{r.available}</div>
                      <div className="text-[10px] text-muted-foreground">متاحة الآن</div>
                    </button>
                    <button type="button" onClick={() => setDetailsPkg(r)} className="rounded-lg bg-warning/10 py-1.5 hover:bg-warning/15 transition">
                      <div className="font-bold text-warning text-lg">{r.sold_count}</div>
                      <div className="text-[10px] text-muted-foreground">مباع</div>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setDetailsPkg(r)}
                      className="w-full rounded-xl font-semibold h-10">
                      التفاصيل
                    </Button>
                    <Button disabled={noStock} onClick={() => setConfirmPkg(r)}
                      className="w-full rounded-xl gradient-primary-bg border-0 font-semibold h-10">
                      {noStock ? "لا كروت" : "بيع كرت"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}


      {/* Confirm */}
      <Sheet open={!!confirmPkg} onOpenChange={(o) => !o && setConfirmPkg(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl" dir="rtl">
          <SheetHeader>
            <SheetTitle>تأكيد البيع</SheetTitle>
            <SheetDescription>لن تظهر بيانات الكرت إلا بعد تأكيد البيع.</SheetDescription>
          </SheetHeader>
          {confirmPkg && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${confirmPkg.color}, ${confirmPkg.color}dd)` }}>
                <div className="opacity-80 text-sm">{confirmPkg.network_name} — {confirmPkg.package_name}</div>
                <div className="text-3xl font-extrabold">{fmtMoney(Number(confirmPkg.price))} <span className="text-sm font-normal opacity-70">{confirmPkg.currency}</span></div>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <span>سيتم خصم أول كرت من كبينتك ولا يمكن التراجع.</span>
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

      {/* Result */}
      <Sheet open={!!saleResult} onOpenChange={(o) => !o && setSaleResult(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-success"><Check className="h-5 w-5" />تم البيع بنجاح</SheetTitle>
          </SheetHeader>
          {saleResult && <SaleReceipt sale={saleResult} />}
        </SheetContent>
      </Sheet>

      {/* Package details */}
      <Sheet open={!!detailsPkg} onOpenChange={(o) => !o && setDetailsPkg(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto p-0" dir="rtl">
          <SheetHeader className="sr-only"><SheetTitle>تفاصيل الكروت</SheetTitle></SheetHeader>
          {detailsPkg && user && <PackageDetails pkg={detailsPkg} agentId={user.id} onClose={() => setDetailsPkg(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PackageDetails({ pkg, agentId, onClose }: { pkg: CabinRow; agentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"sold" | "available">("available");
  const [q, setQ] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const { data: cards, isFetching, refetch } = useQuery({
    queryKey: ["cabin-cards", pkg.package_id, agentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cards")
        .select("id, username, status, assigned_at, sold_at")
        .eq("package_id", pkg.package_id)
        .or(`assigned_to.eq.${agentId},sold_to.eq.${agentId}`)
        .order("sold_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = (cards ?? []).filter((c) => tab === "sold" ? c.status === "SOLD" : c.status === "ASSIGNED");
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
        <Button size="icon" variant="ghost" className="rounded-full h-9 w-9" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["agent-cabin"] }); }}>
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
            <Input placeholder="ابحث باسم المستخدم..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-2xl h-11 bg-background" />
          </div>
        </div>
      )}


      <div className="p-4 flex items-center justify-center gap-2">
        <button onClick={() => setTab("available")}
          className={`rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-2 border ${tab === "available" ? "bg-card text-foreground border-border" : "bg-transparent text-muted-foreground border-transparent"}`}>
          متاحة <span className="rounded-full bg-muted/60 px-1.5 text-[11px]">{available}</span>
        </button>
        <button onClick={() => setTab("sold")}
          className={`rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-2 ${tab === "sold" ? "gradient-primary-bg text-white" : "bg-transparent text-muted-foreground"}`}>
          مباعة <span className="rounded-full bg-white/25 px-1.5 text-[11px]">{sold}</span>
        </button>
      </div>

      <div className="px-4 pb-6 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {tab === "available" && (() => {
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
                    await printCards({
                      template: tpl,
                      codes: availableCodes,
                      title: `${pkg.network_name} — ${pkg.package_name}`,
                      autoPrint,
                    });
                  } catch (printErr) {
                    console.error("[doPrint] printCards failed:", printErr);
                    toast.error("فشلت الطباعة، يرجى المحاولة مجدداً");
                    return;
                  }

                  if (autoPrint) {
                    // تحويل جميع الكروت المتاحة إلى مباع
                    toast.info(`جارٍ تحويل ${availableCodes.length} كرت إلى مباع...`);
                    let ok = 0, fail = 0;
                    for (let i = 0; i < availableCodes.length; i++) {
                      try {
                        const { error } = await supabase.rpc("sell_card", { _package_id: pkg.package_id });
                        if (error) fail++; else ok++;
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
                  <Button size="sm" variant="outline" className="rounded-xl h-9" onClick={() => setTplOpen(true)}>
                    <ImageIcon className="h-4 w-4 ml-1" /> قالب الطباعة
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl h-9" disabled={available === 0} onClick={() => doPrint(false)}>
                    <Search className="h-4 w-4 ml-1" /> معاينة ({available})
                  </Button>
                  <Button size="sm" className="rounded-xl h-9 gradient-primary-bg border-0" disabled={available === 0} onClick={() => doPrint(true)}>
                    <Printer className="h-4 w-4 ml-1" /> طباعة وتحويل إلى مباع
                  </Button>
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-card border border-border/50 px-3 py-1 text-xs">العملة: {pkg.currency}</span>
            <span className="rounded-full bg-card border border-border/50 px-3 py-1 text-xs">الشبكة: {pkg.network_name}</span>
          </div>
        </div>



        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">لا توجد كروت.</div>
        ) : filtered.map((c) => (
          <Card key={c.id} className="border-0 card-elegant p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "SOLD" ? "bg-warning/15 text-warning border border-warning/30" : "bg-success/15 text-success border border-success/30"}`}>
                {c.status === "SOLD" ? "مباع" : "متاح"}
              </span>
              <div className="flex items-center gap-2 font-mono font-extrabold text-base">
                <span>{c.status === "SOLD" ? c.username : "••••••••"}</span>
                <UserIcon className={`h-4 w-4 ${c.status === "SOLD" ? "text-success" : "text-muted-foreground"}`} />
              </div>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 flex items-center justify-between text-sm">
              <span className="font-bold">{pkg.currency} {fmtMoney(Number(pkg.price))}</span>
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
        ))}
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border/50 p-3">
        <Button variant="outline" className="w-full rounded-xl h-11" onClick={onClose}>إغلاق</Button>
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


function StatMini({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "primary" }) {
  const c = tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary";
  return (
    <Card className="card-elegant border-0 p-3 text-center">
      <div className={`text-lg font-extrabold ${c.split(" ")[1]}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </Card>
  );
}

function SaleReceipt({ sale }: { sale: any }) {
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`تم نسخ ${label}`);
    } catch (err) {
      console.error("[copy] failed:", err);
      toast.error("فشل النسخ");
    }
  }
  
  const fullText = `بيانات الكرت:\n\nاليوزر: ${sale.card_username}\n${sale.card_password ? `كلمة المرور: ${sale.card_password}\n` : ""}الفئة: ${sale.package_name}\nالشبكة: ${sale.network_name}`;
  
  return (
    <div className="mt-4 space-y-3 pb-4">
      <div className="rounded-2xl border-2 border-dashed border-primary/40 p-5 bg-primary/5 space-y-2">
        <Row label="الشبكة" value={`${sale.network_name} — ${sale.package_name}`} />
        <Row label="اسم المستخدم" value={sale.card_username} onCopy={() => copy(sale.card_username, "اسم المستخدم")} />
        {sale.card_password && <Row label="كلمة المرور" value={sale.card_password} onCopy={() => copy(sale.card_password, "كلمة المرور")} />}
        <Row label="السعر" value={fmtMoney(Number(sale.price))} />
        <Row label="رقم العملية" value={sale.transaction_no} onCopy={() => copy(sale.transaction_no, "رقم العملية")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => copy(fullText, "البيانات")}><Copy className="h-4 w-4 ml-1" />نسخ</Button>
        <Button variant="outline" className="rounded-xl" onClick={async () => {
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
        }}><Share2 className="h-4 w-4 ml-1" />مشاركة</Button>
        <Button variant="outline" className="rounded-xl" onClick={async () => {
          try {
            const { isNativeApp } = await import("@/lib/native-pdf");
            if (isNativeApp()) {
              try {
                const { Share } = await import("@capacitor/share");
                await Share.share({ text: fullText, dialogTitle: "إرسال عبر واتساب" });
                return;
              } catch (e) {
                console.error("[SaleReceipt] WhatsApp Share failed:", e);
              }
            }
            window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, "_blank");
          } catch (err) {
            console.error("[SaleReceipt] WhatsApp error:", err);
            toast.error("فشل فتح واتساب");
          }
        }}><MessageCircle className="h-4 w-4 ml-1" />واتساب</Button>
        <Button variant="outline" className="rounded-xl" onClick={async () => {
          try {
            const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
            const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(sale.transaction_no)}</title><style>body{font-family:Cairo,sans-serif;padding:20px;text-align:center;background:#fff}.b{border:2px dashed #009688;border-radius:12px;padding:16px;margin:12px auto;max-width:340px}h1{color:#009688;margin:0 0 8px}.k{color:#666;font-size:12px}.v{font-weight:bold;font-size:18px;margin-bottom:8px}</style></head><body><div class="b"><h1>${esc(sale.network_name)}</h1><div class="k">${esc(sale.package_name)}</div><hr/><div class="k">اسم المستخدم</div><div class="v">${esc(sale.card_username)}</div>${sale.card_password?`<div class="k">كلمة المرور</div><div class="v">${esc(sale.card_password)}</div>`:""}<div class="k">السعر</div><div class="v">${esc(fmtMoney(Number(sale.price)))}</div><div class="k" style="margin-top:8px">رقم العملية: ${esc(sale.transaction_no)}</div></div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
            const { openHtmlForPrint } = await import("@/lib/native-pdf");
            await openHtmlForPrint({ html, filename: `فاتورة_${sale.transaction_no}`, dialogTitle: "طباعة أو مشاركة الفاتورة" });
          } catch (err) {
            console.error("[SaleReceipt] print error:", err);
            toast.error("فشل الطباعة");
          }
        }}>طباعة</Button>
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