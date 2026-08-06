import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cleanPhoneLike, fmtArabicDateTime } from "@/lib/format";

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

export function ResetPasswordButton({
  userId,
  label,
  triggerLabel,
}: {
  userId: string;
  label: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [show, setShow] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      if (pwd.length < 6) throw new Error("كلمة المرور 6 أحرف على الأقل");
      if (pwd !== pwd2) throw new Error("كلمة المرور غير متطابقة");
      const { error } = await (supabase.rpc as any)("superadmin_reset_password", {
        _target_user_id: userId,
        _new_password: pwd,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تعديل كلمة المرور");
      setOpen(false);
      setPwd("");
      setPwd2("");
    },
    onError: (e: any) => toast.error(e.message ?? "فشل التعديل"),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPwd("");
          setPwd2("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerLabel ?? "تعديل"}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل كلمة المرور {label ? `— ${label}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>كلمة المرور الجديدة</Label>
            <Input
              type={show ? "text" : "password"}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="6 أحرف على الأقل"
            />
          </div>
          <div>
            <Label>تأكيد كلمة المرور</Label>
            <Input
              type={show ? "text" : "password"}
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            إظهار كلمة المرور
          </label>
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

export function ResetRequestsPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["sa-reset-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("superadmin_reset_requests");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("superadmin_resolve_reset_request", {
        _id: id,
        _status: "RESOLVED",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إغلاق الطلب");
      qc.invalidateQueries({ queryKey: ["sa-reset-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "فشل"),
  });

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase.rpc as any)("superadmin_delete_reset_requests", {
        _ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الطلبات المحددة");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["sa-reset-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "فشل الحذف"),
  });

  const rows = q.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r: any) => r.id)));

  return (
    <Card className="overflow-hidden">
      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            تحديد الكل ({rows.length})
          </label>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/40"
            disabled={selected.size === 0 || del.isPending}
            onClick={() => {
              if (confirm(`حذف ${selected.size} طلب استعادة؟`)) del.mutate(Array.from(selected));
            }}
          >
            <Trash2 className="h-4 w-4 ml-1" />
            حذف المحدد ({selected.size})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table dir="rtl" className="w-full text-sm border-collapse border">
          <thead className="bg-muted/50">
            <tr>
              <Th>
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </Th>
              <Th>رقم الجوال</Th>
              <Th>المستخدم المطابق</Th>
              <Th>الاسم</Th>
              <Th>الشبكة</Th>
              <Th>ملاحظة</Th>
              <Th>الحالة</Th>
              <Th>التاريخ</Th>
              <Th>إجراءات</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <Td>
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </Td>
                <Td dir="ltr" className="font-mono">
                  {r.phone}
                </Td>
                <Td>{cleanPhoneLike(r.matched_username) || "—"}</Td>
                <Td>{r.matched_full_name ?? "—"}</Td>
                <Td>{r.matched_network_name ?? "—"}</Td>
                <Td className="max-w-[220px]">{r.note ?? "—"}</Td>
                <Td>
                  {r.status === "PENDING" ? (
                    <Badge>قيد الانتظار</Badge>
                  ) : (
                    <Badge variant="secondary">تم</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs">{fmtArabicDateTime(r.created_at)}</Td>
                <Td>
                  <div className="flex gap-1 flex-wrap">
                    {r.matched_user_id && (
                      <ResetPasswordButton
                        userId={r.matched_user_id}
                        label={r.matched_full_name ?? r.phone}
                      />
                    )}
                    {r.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate(r.id)}
                      >
                        إغلاق
                      </Button>
                    )}
                    {r.phone && (
                      <a
                        href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center h-8 px-2 rounded-md text-xs bg-[#25D366] text-white"
                      >
                        واتساب
                      </a>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <Td colSpan={9} className="text-center text-muted-foreground py-8">
                  لا توجد طلبات
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
