import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
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
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  Router,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff,
  Loader2,
  Wifi,
  Users,
  CreditCard,
  Package as PackageIcon,
  LogOut,
  PlugZap,
  Smartphone,
} from "lucide-react";
import {
  mtGetOverview,
  mtGetActive,
  mtKickActive,
  mtGetUsers,
  mtAddUser,
  mtDeleteUser,
  mtGetProfiles,
  mtAddProfile,
  mtDeleteProfile,
  mtTestConnection,
} from "@/lib/mikrotik.functions";
import {
  mtLocalTest,
  mtLocalOverview,
  mtLocalActive,
  mtLocalKickActive,
  mtLocalUsers,
  mtLocalAddUser,
  mtLocalDeleteUser,
  mtLocalProfiles,
  mtLocalAddProfile,
  mtLocalDeleteProfile,
  type LocalRouter,
} from "@/lib/mikrotik-local";

export const Route = createFileRoute("/app/mikrotiks")({
  head: () => ({
    meta: [
      { title: "أجهزة مايكروتك — كرتي" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "ربط أجهزة مايكروتك بالشبكة وإدارة اتصالها وسحب الكروت." },
      { property: "og:title", content: "أجهزة مايكروتك — كرتي" },
      { property: "og:description", content: "ربط أجهزة مايكروتك بالشبكة وإدارة اتصالها وسحب الكروت." },
    ],
  }),
  component: MikrotiksPage });

// كلمة المرور لا تُجلب إلى المتصفح إطلاقاً — تُدار من السيرفر فقط
type Mikrotik = {
  id: string;
  network_id: string;
  name: string;
  host: string;
  username: string;
  password?: string; // تُجلب إلى المتصفح فقط في وضع الاتصال المحلي
  port: number;
  use_https: boolean; // تُستخدم الآن كـ API-SSL (tls)
  allow_agent_provision?: boolean;
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
  allow_agent_provision: false,
  notes: "",
};

function MikrotiksPage() {
  const { profile, role, isSuperadmin } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin" || isSuperadmin;

  // وضع الاتصال المحلي: يتصل التطبيق بالميكروتك من هذا الجهاز مباشرة (نفس شبكة الواي فاي)
  const [localMode, setLocalMode] = useState(false);
  useEffect(() => {
    try {
      setLocalMode(localStorage.getItem("mt-local-mode") === "1");
    } catch {
      /* تجاهل */
    }
  }, []);
  const toggleLocalMode = (v: boolean) => {
    setLocalMode(v);
    try {
      localStorage.setItem("mt-local-mode", v ? "1" : "0");
    } catch {
      /* تجاهل */
    }
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["mikrotiks", profile?.network_id, localMode],
    queryFn: async () => {
      // كلمة المرور تُجلب فقط في الوضع المحلي لأن الاتصال يتم من الجهاز نفسه
      const cols = localMode
        ? "id, network_id, name, host, username, password, port, use_https, allow_agent_provision, notes, created_at"
        : "id, network_id, name, host, username, port, use_https, allow_agent_provision, notes, created_at";
      const { data, error } = await supabase
        .from("mikrotiks")
        .select(cols)
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
        password: "", // كلمة المرور لا تُعرض — اتركها فارغة للإبقاء على الحالية
        port: editing.port,
        use_https: editing.use_https,
        allow_agent_provision: editing.allow_agent_provision ?? false,
        notes: editing.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing, openForm]);

  const test = useMutation({
    mutationFn: async () => {
      if (localMode) {
        const password = form.password || editing?.password || "";
        if (!password) throw new Error("كلمة المرور مطلوبة للاختبار المحلي");
        const res = await mtLocalTest({
          host: form.host.trim(),
          port: Number(form.port) || 8728,
          username: form.username.trim(),
          password,
          use_https: form.use_https,
        });
        if (!res.ok) throw new Error(res.error);
        return res;
      }
      const res = await mtTestConnection({
        data: {
          mikrotikId: editing?.id,
          host: form.host.trim(),
          port: Number(form.port) || 8728,
          username: form.username.trim(),
          password: form.password || undefined,
          use_ssl: form.use_https,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) =>
      toast.success(`الاتصال ناجح ✅ — ${res.identity || "جهاز"} (RouterOS ${res.version || "?"})`),
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.network_id) throw new Error("لا توجد شبكة");
      const payload = {
        network_id: profile.network_id,
        name: form.name.trim(),
        host: form.host.trim(),
        username: form.username.trim(),
        port: Number(form.port) || 8728,
        use_https: form.use_https,
        allow_agent_provision: form.allow_agent_provision,
        notes: form.notes.trim() || null,
        // حدّث كلمة المرور فقط لو كتب المستخدم كلمة جديدة فعلياً
        ...(form.password ? { password: form.password } : {}),
      };
      if (!payload.name || !payload.host || !payload.username) {
        throw new Error("الاسم والعنوان واسم المستخدم مطلوبة");
      }
      if (!editing && !form.password) {
        throw new Error("كلمة المرور مطلوبة عند إضافة جهاز جديد");
      }
      if (editing) {
        const { error } = await supabase.from("mikrotiks").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mikrotiks")
          .insert({ ...payload, created_by: profile.id });
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
        description={
          localMode
            ? "وضع الاتصال المحلي: يتصل التطبيق بالميكروتك من هذا الجهاز مباشرة — يجب أن تكون على نفس شبكة الواي فاي للراوتر."
            : "إدارة أجهزة الميكروتيك عبر RouterOS API (يدعم v6 و v7). الاتصال يتم من السيرفر — يمكنك إدارة الراوتر من أي مكان."
        }
        action={
          <Dialog
            open={openForm}
            onOpenChange={(o) => {
              setOpenForm(o);
              if (!o) setEditing(null);
            }}
          >
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
                  {localMode ? (
                    <>
                      الوضع المحلي يستخدم REST API ويتطلب RouterOS v7 أو أحدث. فعّل الخدمة:{" "}
                      <span dir="ltr">/ip service enable www</span> واستخدم عنوان الشبكة المحلية
                      مثل <span dir="ltr">192.168.88.1</span> — يجب أن يكون جوالك على نفس الواي فاي.
                    </>
                  ) : (
                    <>
                      الاتصال عبر RouterOS API من السيرفر. فعّل الخدمة في الميكروتيك:{" "}
                      <span dir="ltr">/ip service enable api</span> ويُفضّل{" "}
                      <span dir="ltr">api-ssl</span> للتشفير. إن كان الراوتر خلف NAT فافتح المنفذ
                      (Port Forward) للإنترنت.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <FormRow label="اسم الجهاز">
                  <Input aria-label="مثال: راوتر الفرع الرئيسي"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: راوتر الفرع الرئيسي"
                  />
                </FormRow>
                <FormRow label="عنوان IP العام أو الدومين">
                  <Input aria-label="192.168.88.1"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    placeholder="203.0.113.10 أو router.example.com"
                    dir="ltr"
                  />
                </FormRow>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="اسم المستخدم">
                    <Input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      dir="ltr"
                    />
                  </FormRow>
                  <FormRow label="منفذ API">
                    <Input aria-label="المنفذ"
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                      dir="ltr"
                      placeholder="8728"
                    />
                  </FormRow>
                </div>
                <FormRow label={editing ? "كلمة المرور (اتركها فارغة للإبقاء على الحالية)" : "كلمة المرور"}>
                  <PasswordInput
                    value={form.password}
                    onChange={(v) => setForm({ ...form, password: v })}
                  />
                </FormRow>
                <div className="flex items-center justify-between p-3 rounded-xl border">
                  <div>
                    <div className="text-sm font-medium">اتصال مشفّر (API-SSL)</div>
                    <div className="text-xs text-muted-foreground">
                      فعّل لو خدمة api-ssl مُشغّلة في الميكروتيك (المنفذ الافتراضي 8729)
                    </div>
                  </div>
                  <Switch
                    checked={form.use_https}
                    onCheckedChange={(v) => setForm({ ...form, use_https: v })}
                  />
                 </div>
                <div className="flex items-center justify-between p-3 rounded-xl border">
                  <div>
                    <div className="text-sm font-medium">السماح بالبيع الفوري للمناديب</div>
                    <div className="text-xs text-muted-foreground">
                      يستطيع المندوب البيع بدون كروت محمّلة — يُنشأ المستخدم في الهوت سبوت لحظة
                      البيع
                    </div>
                  </div>
                  <Switch
                    checked={form.allow_agent_provision}
                    onCheckedChange={(v) => setForm({ ...form, allow_agent_provision: v })}
                  />
                </div>
                <FormRow label="ملاحظات (اختياري)">
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </FormRow>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => test.mutate()}
                  disabled={test.isPending || !form.host.trim() || !form.username.trim()}
                  className="rounded-xl gap-1"
                >
                  {test.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlugZap className="h-4 w-4" />
                  )}
                  اختبار الاتصال
                </Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="rounded-xl"
                >
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  {editing ? "حفظ التعديلات" : "حفظ"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-3 mb-4 bg-info/10 border-info/30 text-xs leading-6">
        <strong>ملاحظات اتصال:</strong>
        <ul className="list-disc pr-5 mt-1 space-y-0.5">
          <li>الاتصال يتم من السيرفر مباشرة — لا حاجة أن يكون جوالك على شبكة الميكروتيك.</li>
          <li>
            فعّل خدمة API في الميكروتيك: <span dir="ltr">/ip service enable api</span> (المنفذ
            8728) أو <span dir="ltr">api-ssl</span> (المنفذ 8729، يُنصح به للتشفير).
          </li>
          <li>
            يجب أن يكون العنوان <strong>IP عاماً</strong> — العناوين المحلية (192.168.x.x /
            10.x.x.x) لا يمكن للسيرفر السحابي الوصول إليها.
          </li>
          <li>للوصول من خارج الشبكة المحلية افتح منفذ API على الراوتر (Port Forward) أو استخدم IP عاماً.</li>
          <li>
            الاتصال الخام (TCP 8728) يتطلب استضافة Node.js مثل <strong>Render</strong> — لا يعمل في
            معاينة Lovable السحابية.
          </li>
          <li>يعمل مع RouterOS v6 و v7 معاً.</li>
        </ul>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
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
              onEdit={() => {
                setEditing(m);
                setOpenForm(true);
              }}
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

function MikrotikCard({
  item,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: Mikrotik;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const webUrl = `http://${item.host}`;
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-xl gradient-primary-bg p-2 shrink-0">
            <Router className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{item.name}</div>
            <div className="text-xs text-muted-foreground truncate" dir="ltr">
              {item.host}:{item.port}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoPill label="المستخدم" value={item.username} ltr />
        <InfoPill label="التشفير" value={item.use_https ? "API-SSL" : "API عادي"} />
      </div>

      <div className="text-xs flex items-center gap-1">
        <span className="text-muted-foreground">كلمة المرور:</span>
        <span className="tracking-widest select-none">••••••••</span>
      </div>

      <div className="flex flex-wrap gap-2 mt-auto">
        <Button
          size="sm"
          className="rounded-xl gradient-primary-bg text-primary-foreground gap-1 flex-1"
          onClick={onOpen}
        >
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
              <AlertDialogDescription>
                سيتم حذف بيانات "{item.name}". هل تريد المتابعة؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground"
              >
                حذف
              </AlertDialogAction>
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
      <div className="text-xs font-medium truncate" dir={ltr ? "ltr" : "rtl"}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// نافذة تفاصيل الجهاز — كل الاتصالات تتم من السيرفر عبر RouterOS API
// ============================================================

type MtRow = Record<string, string>;

function MikrotikDetailsDialog({ item, onClose }: { item: Mikrotik | null; onClose: () => void }) {
  const webUrl = item ? `http://${item.host}` : "";

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Router className="h-5 w-5 text-primary" />
            {item?.name}
          </DialogTitle>
          <DialogDescription>
            <span dir="ltr" className="inline-block">
              {item?.host}:{item?.port}
            </span>{" "}
            — RouterOS API (من السيرفر)
          </DialogDescription>
        </DialogHeader>

        {item && (
          <Tabs defaultValue="overview" dir="rtl">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="overview" className="gap-1">
                <Wifi className="h-4 w-4" /> نظرة عامة
              </TabsTrigger>
              <TabsTrigger value="active" className="gap-1">
                <Users className="h-4 w-4" /> النشطون
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1">
                <CreditCard className="h-4 w-4" /> الكروت
              </TabsTrigger>
              <TabsTrigger value="profiles" className="gap-1">
                <PackageIcon className="h-4 w-4" /> الباقات
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab mikrotikId={item.id} />
            </TabsContent>
            <TabsContent value="active" className="mt-4">
              <ActiveTab mikrotikId={item.id} />
            </TabsContent>
            <TabsContent value="users" className="mt-4">
              <UsersTab mikrotikId={item.id} />
            </TabsContent>
            <TabsContent value="profiles" className="mt-4">
              <ProfilesTab mikrotikId={item.id} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <a href={webUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" className="rounded-xl gap-1">
              <ExternalLink className="h-4 w-4" />
              فتح WebFig
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm space-y-2">
      <div className="font-semibold">تعذّر الاتصال بالميكروتيك</div>
      <div className="text-xs text-muted-foreground break-all">{msg}</div>
      <ul className="text-xs list-disc pr-5 space-y-0.5 text-muted-foreground">
        <li>
          تأكد من تفعيل خدمة API: <span dir="ltr">/ip service enable api</span> (أو api-ssl).
        </li>
        <li>تأكد من فتح المنفذ على الراوتر (Port Forward) إن كان الجهاز خلف NAT.</li>
        <li>تحقق من العنوان والمنفذ واسم المستخدم وكلمة المرور.</li>
      </ul>
      {onRetry && (
        <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

function OverviewTab({ mikrotikId }: { mikrotikId: string }) {
  const q = useQuery({
    queryKey: ["mt-overview", mikrotikId],
    queryFn: () => mtGetOverview({ data: { mikrotikId } }),
    retry: false,
  });

  const bytesToMB = (v?: string) => {
    if (!v) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  if (q.isLoading) return <LoadingRow />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const info = q.data!;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <StatCell label="اسم الجهاز" value={info.identity ?? "—"} />
      <StatCell label="الإصدار" value={info.version ?? "—"} />
      <StatCell label="اللوحة" value={info.boardName ?? "—"} />
      <StatCell label="مدة التشغيل" value={info.uptime ?? "—"} />
      <StatCell label="حمل المعالج" value={info.cpuLoad ? `${info.cpuLoad}%` : "—"} />
      <StatCell label="الذاكرة الحرة" value={bytesToMB(info.freeMemory)} />
      <StatCell label="إجمالي الذاكرة" value={bytesToMB(info.totalMemory)} />
      <div className="col-span-2 md:col-span-4">
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl gap-1 w-full"
          onClick={() => q.refetch()}
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </Button>
      </div>
    </div>
  );
}

function ActiveTab({ mikrotikId }: { mikrotikId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["mt-active", mikrotikId],
    queryFn: () => mtGetActive({ data: { mikrotikId } }) as Promise<MtRow[]>,
    retry: false,
    refetchInterval: 10000,
  });

  const kick = useMutation({
    mutationFn: (activeId: string) => mtKickActive({ data: { mikrotikId, activeId } }),
    onSuccess: () => {
      toast.success("تم قطع الاتصال");
      qc.invalidateQueries({ queryKey: ["mt-active", mikrotikId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <LoadingRow />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;

  const list = q.data ?? [];
  if (list.length === 0) return <EmptyRow label="لا يوجد مستخدمون نشطون حالياً" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          عدد النشطين: <strong>{list.length}</strong>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl gap-1"
          onClick={() => q.refetch()}
        >
          <RefreshCw className="h-3 w-3" /> تحديث
        </Button>
      </div>
      <div className="grid gap-2">
        {list.map((u) => (
          <Card key={u[".id"]} className="p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate" dir="ltr">
                  {u.user}
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3" dir="ltr">
                  <span>IP: {u.address}</span>
                  <span>MAC: {u["mac-address"]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {u.uptime}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-destructive gap-1"
                  onClick={() => kick.mutate(u[".id"])}
                  disabled={kick.isPending}
                >
                  <LogOut className="h-3 w-3" /> قطع
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UsersTab({ mikrotikId }: { mikrotikId: string }) {
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({ name: "", password: "", profile: "default" });

  const users = useQuery({
    queryKey: ["mt-users", mikrotikId],
    queryFn: () => mtGetUsers({ data: { mikrotikId } }) as Promise<MtRow[]>,
    retry: false,
  });

  const profiles = useQuery({
    queryKey: ["mt-profiles", mikrotikId],
    queryFn: () => mtGetProfiles({ data: { mikrotikId } }) as Promise<MtRow[]>,
    retry: false,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اسم المستخدم مطلوب");
      await mtAddUser({
        data: {
          mikrotikId,
          name: form.name.trim(),
          password: form.password,
          profile: form.profile || "default",
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إضافة المستخدم");
      setOpenAdd(false);
      setForm({ name: "", password: "", profile: "default" });
      qc.invalidateQueries({ queryKey: ["mt-users", mikrotikId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (userId: string) => mtDeleteUser({ data: { mikrotikId, userId } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["mt-users", mikrotikId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (users.isLoading) return <LoadingRow />;
  if (users.error) return <ErrorBox error={users.error} onRetry={() => users.refetch()} />;

  const list = users.data ?? [];
  const profList = profiles.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          إجمالي الكروت: <strong>{list.length}</strong>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1"
            onClick={() => users.refetch()}
          >
            <RefreshCw className="h-3 w-3" /> تحديث
          </Button>
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl gradient-primary-bg text-primary-foreground gap-1"
              >
                <Plus className="h-3 w-3" /> إضافة كرت
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-sm">
              <DialogHeader>
                <DialogTitle>إضافة كرت (Hotspot User)</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <FormRow label="اسم المستخدم">
                  <Input
                    dir="ltr"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </FormRow>
                <FormRow label="كلمة المرور">
                  <Input
                    dir="ltr"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </FormRow>
                <FormRow label="الباقة (Profile)">
                  <Select
                    value={form.profile}
                    onValueChange={(v) => setForm({ ...form, profile: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="default" />
                    </SelectTrigger>
                    <SelectContent>
                      {profList.length === 0 && <SelectItem value="default">default</SelectItem>}
                      {profList.map((p) => (
                        <SelectItem key={p[".id"]} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => add.mutate()}
                  disabled={add.isPending}
                  className="rounded-xl"
                >
                  {add.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  حفظ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyRow label="لا توجد كروت" />
      ) : (
        <div className="grid gap-2">
          {list.map((u) => (
            <Card key={u[".id"]} className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" dir="ltr">
                    {u.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3" dir="ltr">
                    <span>Profile: {u.profile ?? "default"}</span>
                    {u["limit-uptime"] && <span>Limit: {u["limit-uptime"]}</span>}
                    {u.uptime && <span>Uptime: {u.uptime}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {u.disabled === "true" && (
                    <Badge variant="destructive" className="text-[10px]">
                      معطّل
                    </Badge>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="rounded-xl text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent dir="rtl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>حذف الكرت</AlertDialogTitle>
                        <AlertDialogDescription>
                          سيتم حذف "{u.name}" من الميكروتيك.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => del.mutate(u[".id"])}
                          className="bg-destructive text-destructive-foreground"
                        >
                          حذف
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfilesTab({ mikrotikId }: { mikrotikId: string }) {
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    rate_limit: "",
    session_timeout: "",
    shared_users: "1",
  });

  const profiles = useQuery({
    queryKey: ["mt-profiles", mikrotikId],
    queryFn: () => mtGetProfiles({ data: { mikrotikId } }) as Promise<MtRow[]>,
    retry: false,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اسم الباقة مطلوب");
      await mtAddProfile({
        data: {
          mikrotikId,
          name: form.name.trim(),
          rateLimit: form.rate_limit || undefined,
          sessionTimeout: form.session_timeout || undefined,
          sharedUsers: form.shared_users || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إضافة الباقة");
      setOpenAdd(false);
      setForm({ name: "", rate_limit: "", session_timeout: "", shared_users: "1" });
      qc.invalidateQueries({ queryKey: ["mt-profiles", mikrotikId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (profileId: string) => mtDeleteProfile({ data: { mikrotikId, profileId } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["mt-profiles", mikrotikId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (profiles.isLoading) return <LoadingRow />;
  if (profiles.error) return <ErrorBox error={profiles.error} onRetry={() => profiles.refetch()} />;

  const list = profiles.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          إجمالي الباقات: <strong>{list.length}</strong>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1"
            onClick={() => profiles.refetch()}
          >
            <RefreshCw className="h-3 w-3" /> تحديث
          </Button>
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl gradient-primary-bg text-primary-foreground gap-1"
              >
                <Plus className="h-3 w-3" /> إضافة باقة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-sm">
              <DialogHeader>
                <DialogTitle>إضافة باقة (User Profile)</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <FormRow label="اسم الباقة">
                  <Input aria-label="مثال: 10M-30days"
                    dir="ltr"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: 10M-30days"
                  />
                </FormRow>
                <FormRow label="السرعة (Rate Limit)">
                  <Input aria-label="10M/10M"
                    dir="ltr"
                    value={form.rate_limit}
                    onChange={(e) => setForm({ ...form, rate_limit: e.target.value })}
                    placeholder="10M/10M"
                  />
                </FormRow>
                <FormRow label="مدة الجلسة (Session Timeout)">
                  <Input aria-label="30d 00:00:00"
                    dir="ltr"
                    value={form.session_timeout}
                    onChange={(e) => setForm({ ...form, session_timeout: e.target.value })}
                    placeholder="30d 00:00:00"
                  />
                </FormRow>
                <FormRow label="مستخدمون متزامنون">
                  <Input
                    dir="ltr"
                    type="number"
                    value={form.shared_users}
                    onChange={(e) => setForm({ ...form, shared_users: e.target.value })}
                  />
                </FormRow>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => add.mutate()}
                  disabled={add.isPending}
                  className="rounded-xl"
                >
                  {add.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  حفظ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyRow label="لا توجد باقات" />
      ) : (
        <div className="grid gap-2">
          {list.map((p) => (
            <Card key={p[".id"]} className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" dir="ltr">
                    {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3" dir="ltr">
                    {p["rate-limit"] && <span>Rate: {p["rate-limit"]}</span>}
                    {p["session-timeout"] && <span>Timeout: {p["session-timeout"]}</span>}
                    {p["shared-users"] && <span>Shared: {p["shared-users"]}</span>}
                  </div>
                </div>
                {p.name !== "default" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="rounded-xl text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent dir="rtl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>حذف الباقة</AlertDialogTitle>
                        <AlertDialogDescription>
                          سيتم حذف "{p.name}" من الميكروتيك.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => del.mutate(p[".id"])}
                          className="bg-destructive text-destructive-foreground"
                        >
                          حذف
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
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

function LoadingRow() {
  return (
    <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">جاري الاتصال…</span>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-center text-sm text-muted-foreground py-6">{label}</div>;
}
