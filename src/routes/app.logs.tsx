import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollText, Trash2 } from "lucide-react";
import { useUserNames } from "@/lib/use-user-names";
import { fmtArabicDateTime } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/logs")({ component: LogsPage });

function LogsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;
  const { display: displayName } = useUserNames();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("logs")
        .select("id, actor_username, action, entity, metadata, created_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("logs").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = !!logs?.length && logs.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((logs ?? []).map((l) => l.id)));

  return (
    <>
      <PageHeader title="سجل النشاط" description="آخر 200 عملية في النظام" />
      {!!logs?.length && (
        <div className="flex items-center justify-between mb-3 gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            تحديد الكل
          </label>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/40"
            disabled={selected.size === 0 || del.isPending}
            onClick={() => {
              if (confirm(`حذف ${selected.size} سجل؟`)) del.mutate(Array.from(selected));
            }}
          >
            <Trash2 className="h-4 w-4 ml-1" />حذف المحدد ({selected.size})
          </Button>
        </div>
      )}
      <div className="grid gap-2">
        {logs?.map((l) => (
          <Card key={l.id} className="card-elegant border-0 p-3 flex items-start gap-3">
            <Checkbox className="mt-1" checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <ScrollText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{labelize(l.action)} <span className="text-muted-foreground">— {l.actor_username ? displayName(l.actor_username) : "نظام"}</span></div>
              {l.metadata && <div className="text-[11px] text-muted-foreground font-mono truncate">{JSON.stringify(l.metadata)}</div>}
              <div className="text-[10px] text-muted-foreground">{fmtArabicDateTime(l.created_at)}</div>
            </div>
          </Card>
        ))}
        {logs?.length === 0 && <div className="text-center py-16 text-muted-foreground">لا يوجد نشاط بعد.</div>}
      </div>
    </>
  );
}

function labelize(a: string) {
  const map: Record<string, string> = { SELL_CARD: "بيع كرت", UPLOAD_CARDS: "رفع كروت" };
  return map[a] ?? a;
}
