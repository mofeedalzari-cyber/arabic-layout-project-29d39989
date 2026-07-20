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
import { Plus, Wifi, Edit3, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/app/networks/")({ component: NetworksPage });

const netSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب").max(60),
  description: z.string().trim().max(240).optional(),
  currency: z.string().trim().min(1).max(10).default("ر.س"),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "لون HEX غير صحيح"),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "لون HEX غير صحيح"),
  is_active: z.boolean().default(true),
});
type NetForm = z.infer<typeof netSchema>;

function NetworksPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const { data: networks, isLoading } = useQuery({
    queryKey: ["networks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("networks")
        .select("id, name, description, currency, primary_color, secondary_color, is_active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["network-counts"],
    queryFn: async () => {
      const [pkgs, cards, sales] = await Promise.all([
        supabase.from("packages").select("network_id"),
        supabase.from("cards").select("network_id, status"),
        supabase.from("sales").select("network_id, price"),
      ]);
      const m = new Map<string, { pkgs: number; avail: number; sold: number; value: number }>();
      const get = (id: string) => {
        if (!m.has(id)) m.set(id, { pkgs: 0, avail: 0, sold: 0, value: 0 });
        return m.get(id)!;
      };
      pkgs.data?.forEach((p) => get(p.network_id).pkgs++);
      cards.data?.forEach((c) => { const g = get(c.network_id); if (c.status === "AVAILABLE") g.avail++; else g.sold++; });
      sales.data?.forEach((s) => { get(s.network_id).value += Number(s.price); });
      return m;
    },
    enabled: isAdmin,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const saveMutation = useMutation({
    mutationFn: async (form: NetForm) => {
      if (editing) {
        const { error } = await supabase.from("networks").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("networks").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم التحديث" : "تم إنشاء الشبكة");
      qc.invalidateQueries({ queryKey: ["networks"] });
      qc.invalidateQueries({ queryKey: ["network-counts"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("networks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["networks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="الشبكات"
        description={isAdmin ? "إدارة شبكات الإنترنت المتاحة" : "الشبكات المتاحة للبيع"}
        action={isAdmin ? (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gradient-primary-bg border-0 font-semibold"><Plus className="h-4 w-4 ml-1" />شبكة جديدة</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl" dir="rtl">
              <DialogHeader><DialogTitle>{editing ? "تعديل شبكة" : "شبكة جديدة"}</DialogTitle></DialogHeader>
              <NetworkForm initial={editing} onSubmit={(v) => saveMutation.mutate(v)} busy={saveMutation.isPending} />
            </DialogContent>
          </Dialog>
        ) : undefined}
      />

      {isLoading ? <SkeletonGrid /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {networks?.map((n) => {
            const c = counts?.get(n.id);
            return (
              <Card key={n.id} className="card-elegant card-elegant-hover overflow-hidden border-0 slide-up">
                <Link to="/app/networks/$id" params={{ id: n.id }}>
                  <div className="h-28 relative" style={{ background: `linear-gradient(135deg, ${n.primary_color}, ${n.secondary_color})` }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Wifi className="h-12 w-12 text-white/90" />
                    </div>
                    {!n.is_active && <div className="absolute top-2 right-2 bg-black/40 text-white text-[11px] px-2 py-0.5 rounded-full">موقوفة</div>}
                  </div>
                </Link>
                <div className="p-4">
                  <Link to="/app/networks/$id" params={{ id: n.id }}>
                    <h3 className="font-bold text-lg mb-1">{n.name}</h3>
                    {n.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{n.description}</p>}
                  </Link>
                  {isAdmin && c && (
                    <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                      <MiniStat label="الباقات" value={c.pkgs} />
                      <MiniStat label="متوفر" value={c.avail} tone="success" />
                      <MiniStat label="مباع" value={c.sold} tone="warning" />
                    </div>
                  )}
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 rounded-lg"
                        onClick={() => { setEditing(n); setOpen(true); }}>
                        <Edit3 className="h-3.5 w-3.5 ml-1" />تعديل
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-lg text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`حذف شبكة "${n.name}"؟ سيتم حذف الباقات والكروت المرتبطة.`)) deleteMutation.mutate(n.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          {networks?.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              {isAdmin ? "لم يتم إنشاء أي شبكة بعد." : "لا توجد شبكات متاحة."}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg bg-muted/40 py-1.5">
      <div className={`font-bold ${c}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SkeletonGrid() {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="card-elegant border-0 h-56 animate-pulse" />)}
  </div>;
}

function NetworkForm({ initial, onSubmit, busy }: { initial: any; onSubmit: (v: NetForm) => void; busy: boolean }) {
  const [form, setForm] = useState<NetForm>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    currency: initial?.currency ?? "ر.س",
    primary_color: initial?.primary_color ?? "#009688",
    secondary_color: initial?.secondary_color ?? "#14B8A6",
    is_active: initial?.is_active ?? true,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = netSchema.safeParse(form);
    if (!p.success) return toast.error(p.error.issues[0].message);
    onSubmit(p.data);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label className="text-xs">اسم الشبكة</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label className="text-xs">الوصف</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">العملة</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
        <div><Label className="text-xs">لون أساسي</Label><Input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-10 p-1" /></div>
        <div><Label className="text-xs">لون ثانوي</Label><Input type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="h-10 p-1" /></div>
      </div>
      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
        <Label className="text-sm">تفعيل الشبكة</Label>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy} className="w-full rounded-xl gradient-primary-bg border-0">{busy ? "..." : "حفظ"}</Button>
      </DialogFooter>
    </form>
  );
}