import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Router, Plus, Pencil, Trash2, ExternalLink, RefreshCw, Eye, EyeOff, Loader2 } from "lucide-react";
import { RevealText } from "@/components/reveal-text";

export const Route = createFileRoute("/app/mikrotiks")({ component: MikrotiksPage });

type Mikrotik = {
  id: string;
  network_id: string;
  name: string;
  host: string;
  username: string;
  password: string;
  port: number;
  use_https: boolean;
  notes: string | null;
  created_at: string;
};

const emptyForm = {
  name: "",
  host: "",
  username: "admin",
  password: "",
  port: 8728,
  use_https: false,
  notes: "",
};

function MikrotiksPage() {
  const { profile, role, isSuperadmin } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin" || isSuperadmin;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["mikrotiks", profile?.network_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mikrotiks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mikrotik[];
    },
    enabled: !!profile?.network_id && isAdmin,
  });

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Mikrotik | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Mikrotik | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        host: editing.host,
        username: editing.username,
        password: editing.password,
        port: editing.port,
        use_https: editing.use_https,
        notes: editing.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing, openForm]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.network_id) throw new Error("لا توجد شبكة");
      const payload = {
        network_id: profile.network_id,
        name: form.name.trim(),
        host: form.host.trim(),
        username: form.username.trim(),
        password: form.password,
        port: Number(form.port) || 8728,
        use_https: form.use_https,
        notes: form.notes.trim() || null,
      };
      if (!payload.name || !payload.host || !payload.username) {
        throw new Error("الاسم والعنوان واسم المستخدم مطلوبة");
      }
      if (editing) {
        const { error } = await supabase.from("mikrotiks").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("mikrotiks").insert({ ...payload, created_by: profile.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث الميكروتيك" : "تم إضافة الميكروتيك");
      qc.invalidateQueries({ queryKey: ["mikrotiks"] });
      setOpenForm(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mikrotiks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["mikrotiks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div dir="rtl">
        <PageHeader title="الميكروتيك" description="هذه الصفحة متاحة للمدراء فقط." />
      </div>
    );
  }

  return (
    <div dir="rtl">
      <PageHeader
        title="الميكروتيك"
        description="إدارة أجهزة الميكروتيك التابعة لشبكتك والدخول إلى واجهتها."
        action={
          <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gradient-primary-bg text-primary-foreground gap-2">
                <Plus className="h-4 w-4" />
                إضافة ميكروتيك
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "تعديل الميكروتيك" : "إضافة ميكروتيك"}</DialogTitle>
                <DialogDescription>
                  أدخل بيانات جهاز الميكروتيك للاتصال به. المنفذ الافتراضي 8728.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <FormRow label="اسم الجهاز">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: راوتر الفرع الرئيسي" />
                </FormRow>
                <FormRow label="عنوان IP أو الدومين">
                  <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.88.1" dir="ltr" />
                </FormRow>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="اسم المستخدم">
                    <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} dir="ltr" />
                  </FormRow>
                  <FormRow label="المنفذ">
                    <Input
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                      dir="ltr"
                    />
                  </FormRow>
                </div>
                <FormRow label="كلمة المرور">
                  <PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
                </FormRow>
                <div className="flex items-center justify-between p-3 rounded-xl border">
                  <div>
                    <div className="text-sm font-medium">استخدام HTTPS</div>
                    <div className="text-xs text-muted-foreground">فعّل إذا كان الميكروتيك يستخدم شهادة SSL</div>
                  </div>
                  <Switch checked={form.use_https} onCheckedChange={(v) => setForm({ ...form, use_https: v })} />
                </div>
                <FormRow label="ملاحظات (اختياري)">
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </FormRow>
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl">
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  {editing ? "حفظ التعديلات" : "حفظ"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto rounded-2xl bg-primary/10 p-3 w-fit mb-3">
            <Router className="h-8 w-8 text-primary" />
          </div>
          <p className="font-semibold mb-1">لا توجد أجهزة ميكروتيك</p>
          <p className="text-sm text-muted-foreground">أضف أول جهاز ميكروتيك من الزر أعلاه.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <MikrotikCard
              key={m.id}
              item={m}
              onOpen={() => setSelected(m)}
              onEdit={() => { setEditing(m); setOpenForm(true); }}
              onDelete={() => del.mutate(m.id)}
            />
          ))}
        </div>
      )}

      <MikrotikDetailsDialog item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="pl-9"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
        aria-label="إظهار/إخفاء"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function MikrotikCard({ item, onOpen, onEdit, onDelete }: {
  item: Mikrotik; onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const webUrl = `${item.use_https ? "https" : "http"}://${item.host}`;
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-xl gradient-primary-bg p-2 shrink-0">
            <Router className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{item.name}</div>
            <div className="text-xs text-muted-foreground truncate" dir="ltr">{item.host}:{item.port}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill label="المستخدم" value={item.username} ltr />
        <InfoPill label="HTTPS" value={item.use_https ? "مفعّل" : "معطّل"} />
      </div>

      <div className="text-xs flex items-center gap-1">
        <span className="text-muted-foreground">كلمة المرور:</span>
        <RevealText username={item.password || "—"} />
      </div>

      <div className="flex flex-wrap gap-2 mt-auto">
        <Button size="sm" className="rounded-xl gradient-primary-bg text-primary-foreground gap-1 flex-1" onClick={onOpen}>
          <ExternalLink className="h-4 w-4" />
          الدخول
        </Button>
        <a href={webUrl} target="_blank" rel="noreferrer" className="flex-1">
          <Button size="sm" variant="outline" className="rounded-xl w-full gap-1">
            <ExternalLink className="h-4 w-4" />
            WebFig
          </Button>
        </a>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-xl text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الجهاز</AlertDialogTitle>
              <AlertDialogDescription>سيتم حذف بيانات "{item.name}". هل تريد المتابعة؟</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}

function InfoPill({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium truncate" dir={ltr ? "ltr" : "rtl"}>{value}</div>
    </div>
  );
}

type MikrotikInfo = {
  identity?: string;
  version?: string;
  boardName?: string;
  uptime?: string;
  cpuLoad?: string;
  freeMemory?: string;
  totalMemory?: string;
  activeUsers?: number;
};

function MikrotikDetailsDialog({ item, onClose }: { item: Mikrotik | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<MikrotikInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = item ? `${item.use_https ? "https" : "http"}://${item.host}` : "";
  const webUrl = baseUrl;

  async function tryFetch() {
    if (!item) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const auth = "Basic " + btoa(`${item.username}:${item.password}`);
      const headers = { Authorization: auth, "Content-Type": "application/json" };
      const [resource, identity, hotspot] = await Promise.allSettled([
        fetch(`${baseUrl}/rest/system/resource`, { headers }).then((r) => r.json()),
        fetch(`${baseUrl}/rest/system/identity`, { headers }).then((r) => r.json()),
        fetch(`${baseUrl}/rest/ip/hotspot/active`, { headers }).then((r) => r.json()).catch(() => null),
      ]);

      const res: Record<string, string> | null = resource.status === "fulfilled" ? resource.value : null;
      const idn: Record<string, string> | null = identity.status === "fulfilled" ? identity.value : null;
      if (!res && !idn) throw new Error("تعذّر الاتصال بالميكروتيك");

      setInfo({
        identity: idn?.name,
        version: res?.version,
        boardName: res?.["board-name"],
        uptime: res?.uptime,
        cpuLoad: res?.["cpu-load"],
        freeMemory: res?.["free-memory"],
        totalMemory: res?.["total-memory"],
        activeUsers: Array.isArray(hotspot.status === "fulfilled" ? hotspot.value : null)
          ? (hotspot.status === "fulfilled" ? (hotspot.value as unknown[]).length : undefined)
          : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر الاتصال بالميكروتيك";
      setError(msg + " — قد يكون الجهاز خلف شبكة محلية أو REST API غير مفعّل. استخدم WebFig للدخول المباشر.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (item) tryFetch();
    else {
      setInfo(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const bytesToMB = (v?: string) => {
    if (!v) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Router className="h-5 w-5 text-primary" />
            {item?.name}
          </DialogTitle>
          <DialogDescription>
            <span dir="ltr" className="inline-block">{item?.host}:{item?.port}</span>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">جاري الاتصال بالميكروتيك…</span>
          </div>
        )}

        {!loading && error && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm text-warning-foreground">
            {error}
          </div>
        )}

        {!loading && info && (
          <div className="grid grid-cols-2 gap-2">
            <StatCell label="اسم الجهاز" value={info.identity ?? "—"} />
            <StatCell label="الإصدار" value={info.version ?? "—"} />
            <StatCell label="اللوحة" value={info.boardName ?? "—"} />
            <StatCell label="مدة التشغيل" value={info.uptime ?? "—"} />
            <StatCell label="الحمل على المعالج" value={info.cpuLoad ? `${info.cpuLoad}%` : "—"} />
            <StatCell label="المستخدمون النشطون" value={info.activeUsers != null ? String(info.activeUsers) : "—"} />
            <StatCell label="الذاكرة الحرة" value={bytesToMB(info.freeMemory)} />
            <StatCell label="إجمالي الذاكرة" value={bytesToMB(info.totalMemory)} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" className="rounded-xl gap-1" onClick={tryFetch} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
          <a href={webUrl} target="_blank" rel="noreferrer">
            <Button className="rounded-xl gradient-primary-bg text-primary-foreground gap-1">
              <ExternalLink className="h-4 w-4" />
              فتح واجهة WebFig
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );
}
