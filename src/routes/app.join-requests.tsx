import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Clock, UserPlus, Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { displayPhone } from "@/lib/format";

export const Route = createFileRoute("/app/join-requests")({ component: JoinRequestsPage });

function JoinRequestsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");

  return (
    <div dir="rtl">
      <PageHeader
        title="طلبات انضمام المناديب"
        description="مراجعة طلبات المناديب الجدد للانضمام إلى شبكتك"
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} dir="rtl">
        <TabsList className="rounded-xl mb-4">
          <TabsTrigger value="PENDING" className="rounded-lg">قيد المراجعة</TabsTrigger>
          <TabsTrigger value="APPROVED" className="rounded-lg">مقبولة</TabsTrigger>
          <TabsTrigger value="REJECTED" className="rounded-lg">مرفوضة</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <JoinList status={tab} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JoinList({ status }: { status: string }) {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["join-requests", status],
    queryFn: async () => {
      const { data, error } = await supabase.from("join_requests")
        .select("*").eq("status", status).order("requested_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [rejectFor, setRejectFor] = useState<any>(null);
  const [reason, setReason] = useState("");

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_join_request", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم قبول المندوب وتفعيل حسابه");
      qc.invalidateQueries({ queryKey: ["join-requests"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async ({ id, r }: { id: string; r: string }) => {
      const { error } = await supabase.rpc("reject_join_request", { _request_id: id, _reason: r });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم رفض الطلب");
      setRejectFor(null); setReason("");
      qc.invalidateQueries({ queryKey: ["join-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-muted-foreground">جارٍ التحميل...</div>;
  if (!rows?.length) return (
    <div className="text-center py-16 space-y-2">
      <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
      <div className="text-muted-foreground">لا توجد طلبات.</div>
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        {rows.map((r: any) => (
          <Card key={r.id} className="card-elegant border-0 p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-11 w-11 rounded-full gradient-primary-bg flex items-center justify-center text-white shrink-0">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <div className="font-bold text-base truncate">
                    {r.agent_full_name || displayPhone(r.agent_phone, r.agent_username)}
                  </div>
                  <div className="text-xs text-muted-foreground">{displayPhone(r.agent_phone, r.agent_username)}</div>
                  {r.agent_phone && (
                    <div className="text-xs"><span className="text-muted-foreground">الهاتف: </span>{displayPhone(r.agent_phone, r.agent_username)}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    التاريخ: {new Date(r.requested_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {r.reject_reason && (
                    <div className="text-xs bg-destructive/10 text-destructive rounded-lg p-2 mt-1">
                      سبب الرفض: {r.reject_reason}
                    </div>
                  )}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>

            {r.status === "PENDING" && (
              <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border/50">
                <Button disabled={approve.isPending} onClick={() => approve.mutate(r.id)}
                  className="rounded-lg gradient-primary-bg border-0 text-white h-9 px-3">
                  <Check className="h-4 w-4 ml-1" />قبول
                </Button>
                <Button variant="outline" className="rounded-lg h-9 px-3 text-destructive border-destructive/40"
                  onClick={() => { setRejectFor(r); setReason(""); }}>
                  <X className="h-4 w-4 ml-1" />رفض
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="max-w-md rounded-3xl" dir="rtl">
          <DialogHeader><DialogTitle>رفض طلب الانضمام</DialogTitle></DialogHeader>
          {rejectFor && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                طلب <b>{rejectFor.agent_full_name || displayPhone(rejectFor.agent_phone, rejectFor.agent_username)}</b>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">سبب الرفض (اختياري)</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setRejectFor(null)}>إلغاء</Button>
                <Button disabled={reject.isPending} onClick={() => reject.mutate({ id: rejectFor.id, r: reason })}
                  className="flex-1 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                  تأكيد الرفض
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; l: string; Icon: any }> = {
    PENDING: { c: "bg-warning/15 text-warning", l: "قيد المراجعة", Icon: Clock },
    APPROVED: { c: "bg-success/15 text-success", l: "مقبول", Icon: Check },
    REJECTED: { c: "bg-destructive/15 text-destructive", l: "مرفوض", Icon: X },
  };
  const s = map[status] ?? map.PENDING;
  const Icon = s.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${s.c}`}>
      <Icon className="h-3 w-3" />{s.l}
    </span>
  );
}
