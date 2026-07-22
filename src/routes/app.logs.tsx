import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ScrollText } from "lucide-react";
import { useUserNames } from "@/lib/use-user-names";
import { fmtArabicDateTime } from "@/lib/format";

export const Route = createFileRoute("/app/logs")({ component: LogsPage });

function LogsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;
  const { display: displayName } = useUserNames();

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

  return (
    <>
      <PageHeader title="سجل النشاط" description="آخر 200 عملية في النظام" />
      <div className="grid gap-2">
        {logs?.map((l) => (
          <Card key={l.id} className="card-elegant border-0 p-3 flex items-start gap-3">
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
