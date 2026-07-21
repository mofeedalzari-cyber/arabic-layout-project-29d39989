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
import { Plus, Package as PackageIcon, Edit3, Trash2, Wifi, Layers, CheckCircle2, Clock } from "lucide-react";
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
  if (role && role !== "admin") return <Navigate to="/app" />;
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
    queryKey: ["packages-counts-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("package_id, status");
      const m = new Map<string, { total: number; avail: number; assigned: number; sold: number }>();
      if (error || !data) return m;
      for (const c of data as any[]) {
        const cur = m.get(c.package_id) ?? { total: 0, avail: 0, assigned: 0, sold: 0 };
        cur.total++;
        if (c.status === "AVAILABLE") cur.avail++;
        else if (c.status === "ASSIGNED") cur.assigned++;
        else if (c.status === "SOLD") cur.sold++;
        m.set(c.package_id, cur);
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

  return (
    <>
      <PageHeader
        title="الباقات"
        description="إدارة كل الباقات عبر الشبكات"
        action={
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
          return (
            <Card key={p.id} className="card-elegant border-0 overflow-hidden p-0">
              <div className="p-5 relative" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}dd)` }}>
                <Wifi className="absolute top-3 left-3 h-5 w-5 text-white/40" />
                <div className="absolute top-3 right-3 bg-white/95 text-foreground rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm flex items-center gap-1">
                  <span className="text-success text-sm">{counts?.get(p.id)?.avail ?? 0}</span>
                  <span className="text-muted-foreground">كرت متوفر</span>
                </div>
                <div className="text-white/80 text-[11px] mb-1 mt-6">{net?.name ?? "—"}</div>
                <div className="text-white text-sm/none mb-1">{p.name}</div>
                <div className="text-white text-2xl font-extrabold">
                  {fmtMoney(Number(p.price))}
                  <span className="text-xs font-normal opacity-70 mr-1">{net?.currency}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white/15 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-white/60 text-[10px] mb-0.5">حجم البيانات</div>
                    <div className="text-white font-semibold">{p.data_size ?? "—"}</div>
                  </div>
                  <div className="bg-white/15 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-white/60 text-[10px] mb-0.5">السرعة</div>
                    <div className="text-white font-semibold">{p.speed ?? "—"}</div>
                  </div>
                  <div className="bg-white/15 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-white/60 text-[10px] mb-0.5">مدة الصلاحية</div>
                    <div className="text-white font-semibold">{p.validity ?? "—"}</div>
                  </div>
                  <div className="bg-white/25 rounded-lg px-2 py-1.5 text-center border border-white/30 shadow-sm">
                    <div className="text-white/80 text-[10px] mb-0.5 flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" />الوقت المسموح
                    </div>
                    <div className="text-white font-bold">{p.allowed_time ?? "—"}</div>
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-3">
                {(() => {
                  const c = counts?.get(p.id) ?? { total: 0, avail: 0, assigned: 0, sold: 0 };
                  return (
                    <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                      <div className="rounded-lg bg-muted/60 py-1.5">
                        <div className="font-extrabold text-sm flex items-center justify-center gap-1"><Layers className="h-3 w-3" />{c.total}</div>
                        <div className="text-[10px] text-muted-foreground">الكل</div>
                      </div>
                      <div className="rounded-lg bg-success/10 py-1.5">
                        <div className="font-extrabold text-sm text-success">{c.avail}</div>
                        <div className="text-[10px] text-muted-foreground">متاح</div>
                      </div>
                      <div className="rounded-lg bg-primary/10 py-1.5">
                        <div className="font-extrabold text-sm text-primary">{c.assigned}</div>
                        <div className="text-[10px] text-muted-foreground">مُخصّص</div>
                      </div>
                      <div className="rounded-lg bg-warning/10 py-1.5">
                        <div className="font-extrabold text-sm text-warning flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />{c.sold}</div>
                        <div className="text-[10px] text-muted-foreground">مباع</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => { setEditing(p); setOpen(true); }}>
                    <Edit3 className="h-4 w-4 ml-1" />تعديل
                  </Button>
                  <Button variant="outline" size="icon" className="rounded-xl text-destructive"
                    onClick={() => { if (confirm(`حذف "${p.name}"؟`)) del.mutate({ id: p.id, name: p.name }); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {packages?.length === 0 && (
          <div className="col-span-full text-center py-16 space-y-4">
            <PackageIcon className="h-10 w-10 text-muted-foreground mx-auto" />
            <div className="text-muted-foreground">لا توجد باقات بعد.</div>
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl gradient-primary-bg border-0 font-semibold">
              <Plus className="h-4 w-4 ml-1" />إضافة أول باقة
            </Button>
          </div>
        )}
      </div>
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
        <div><Label className="text-xs">اللون</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
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
