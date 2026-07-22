import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { wipeAllData } from "@/lib/admin-wipe.functions";
import { backupMyNetwork } from "@/lib/network-backup.functions";
import { restoreMyNetwork } from "@/lib/network-restore.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Save, Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const [phone, setPhone] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");

  useEffect(() => {
    setPhone(profile?.phone ?? "");
    setFullName(profile?.full_name ?? "");
  }, [profile?.phone, profile?.full_name]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("no profile");
      const { error } = await supabase.from("profiles")
        .update({ phone: phone.trim() || null, full_name: fullName.trim() || null })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ البيانات");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-phones"] });
      qc.invalidateQueries({ queryKey: ["user-display-names"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="الإعدادات" description="معلومات الحساب" />
      <Card className="card-elegant border-0 p-5 max-w-md space-y-4">
        <Row label="اسم المستخدم" value={profile?.username ? profile.username.replace(/^u/, "") : "—"} />
        <Row label="نوع الحساب" value={role === "admin" ? "مدير" : "وكيل"} />
        <Row label="الحالة" value={profile?.is_active ? "مفعّل" : "موقوف"} />
        <div className="space-y-2">
          <Label className="text-xs">الاسم الكامل</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">رقم الهاتف</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl" dir="ltr" placeholder="7xxxxxxxx" />
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}
          className="w-full rounded-xl gradient-primary-bg border-0 font-semibold">
          <Save className="h-4 w-4 ml-1" />حفظ التعديلات
        </Button>
      </Card>

      {role === "admin" && <BackupCard />}
      {role === "admin" && <DangerZone adminId={profile?.id} />}
    </>
  );
}

function BackupCard() {
  const qc = useQueryClient();
  const backupFn = useServerFn(backupMyNetwork);
  const restoreFn = useServerFn(restoreMyNetwork);
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [pendingName, setPendingName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = useMutation({
    mutationFn: async () => await backupFn(),
    onSuccess: async (data: any) => {
      const netName = data?.network?.name ?? "network";
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `backup-${netName}-${stamp}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      try {
        const { saveBlobToDevice } = await import("@/lib/native-pdf");
        const res = await saveBlobToDevice({
          blob,
          filename,
          mimeType: "application/json",
          dialogTitle: "حفظ النسخة الاحتياطية",
        });
        if (res.shared) {
          toast.success("تم تجهيز النسخة — اختر مكان الحفظ");
        } else {
          toast.success("تم حفظ النسخة في مجلد التنزيلات");
        }
      } catch (err: any) {
        toast.error(`تعذر حفظ الملف: ${err?.message ?? ""}`);
      }
    },
    onError: (e: Error) => toast.error(`فشل النسخ: ${e.message}`),
  });

  const restore = useMutation({
    mutationFn: async (payload: any) => await restoreFn({ data: { payload } }),
    onSuccess: (res: any) => {
      const s = res?.stats ?? {};
      toast.success(
        `تم الاستعادة — باقات: ${s.packages ?? 0}, كروت: ${s.cards ?? 0}, مبيعات: ${s.sales ?? 0}`
      );
      setPendingPayload(null);
      setPendingName("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(`فشل الاستعادة: ${e.message}`),
  });

  const onFilePicked = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.network) throw new Error("الملف لا يحتوي شبكة");
      setPendingPayload(parsed);
      setPendingName(file.name);
      setConfirmRestore(true);
    } catch (e: any) {
      toast.error(`ملف غير صالح: ${e?.message ?? ""}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="card-elegant border-0 p-5 max-w-md mt-6">
      <div className="flex items-center gap-2 mb-2">
        <Download className="h-4 w-4 text-primary" />
        <h3 className="font-bold">النسخة الاحتياطية للشبكة</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        تنزيل ملف JSON يحتوي جميع بيانات شبكتك، أو رفع ملف سابق لاستعادته إلى شبكتك.
      </p>

      <div className="space-y-2">
        <Button
          disabled={backup.isPending}
          onClick={() => setConfirmBackup(true)}
          className="w-full rounded-xl gradient-primary-bg border-0 font-semibold"
        >
          <Download className="h-4 w-4 ml-1" />
          {backup.isPending ? "جاري التحضير…" : "تنزيل نسخة احتياطية"}
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={restore.isPending}
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl font-semibold"
        >
          <Upload className="h-4 w-4 ml-1" />
          {restore.isPending ? "جاري الاستعادة…" : "استعادة من ملف"}
        </Button>
      </div>

      {/* Backup confirmation */}
      <AlertDialog open={confirmBackup} onOpenChange={setConfirmBackup}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تنزيل النسخة الاحتياطية</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء ملف JSON يحتوي جميع بيانات شبكتك (الباقات، الكروت، المبيعات، الطلبات، المدفوعات).
              هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => backup.mutate()}>تنزيل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد استعادة النسخة الاحتياطية</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم <span className="font-bold text-destructive">حذف كل البيانات الحالية</span> في
              شبكتك (الباقات، الكروت، المبيعات، الطلبات، المدفوعات) واستبدالها ببيانات الملف:
              <span className="block mt-1 font-mono text-xs">{pendingName}</span>
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingPayload(null); setPendingName(""); }}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingPayload && restore.mutate(pendingPayload)}
            >
              استعادة الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm">{value}</span>
    </div>
  );
}

function DangerZone({ adminId }: { adminId?: string }) {
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const wipeFn = useServerFn(wipeAllData);

  const wipe = useMutation({
    mutationFn: async () => {
      await wipeFn();
    },
    onSuccess: () => {
      toast.success("تم تصفير قاعدة البيانات بنجاح");
      qc.invalidateQueries();
      setConfirmText("");
      setExpanded(false);
    },
    onError: (e: Error) => toast.error(`فشل المسح: ${e.message}`),
  });

  const canDelete = confirmText.trim() === "مسح";

  return (
    <Card className="card-elegant border-0 p-5 max-w-md mt-6 border-destructive/40">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="font-bold text-destructive">منطقة الخطر</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        سيتم حذف كل الشبكات، الباقات، الكروت، طلبات السحب، المبيعات، السجل، وحسابات المناديب.
        لا يمكن التراجع عن هذا الإجراء. سيبقى حسابك كمدير.
      </p>

      {!expanded ? (
        <Button variant="destructive" size="sm" onClick={() => setExpanded(true)}>
          <Trash2 className="h-4 w-4 ml-1" />
          مسح جميع بيانات الموقع
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            للتأكيد اكتب كلمة <span className="font-bold text-destructive">مسح</span>:
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="مسح"
            dir="rtl"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive" size="sm"
              disabled={!canDelete || wipe.isPending}
              onClick={() => wipe.mutate()}>
              {wipe.isPending ? "جاري المسح…" : "تأكيد المسح النهائي"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setExpanded(false); setConfirmText(""); }}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
