import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search, Receipt } from "lucide-react";
import { fmtMoney, fmtArabicDateTime } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";

export const Route = createFileRoute("/app/sales")({ component: SalesPage });

function SalesPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [q, setQ] = useState("");
  const { display: displayName } = useUserNames();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id, transaction_no, package_name, network_name, agent_username, price, sold_at")
        .order("sold_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!q) return sales;
    const s = q.toLowerCase();
    return sales?.filter((r) =>
      r.transaction_no.toLowerCase().includes(s) ||
      r.package_name.toLowerCase().includes(s) ||
      r.network_name.toLowerCase().includes(s) ||
      r.agent_username.toLowerCase().includes(s) ||
      displayName(r.agent_username).toLowerCase().includes(s)
    );
  }, [sales, q]);

  return (
    <>
      <PageHeader title={isAdmin ? "جميع المبيعات" : "مبيعاتي"} description={`${filtered?.length ?? 0} عملية`} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث برقم العملية أو الاسم..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9 rounded-xl" />
      </div>

      <div className="grid gap-2">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => <Card key={i} className="card-elegant border-0 h-16 animate-pulse" />) :
          filtered?.map((s) => (
            <Card key={s.id} className="card-elegant border-0 p-3 flex items-center gap-3 slide-up">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{s.package_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.network_name} · {displayName(s.agent_username)} · {fmtArabicDateTime(s.sold_at)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">{s.transaction_no}</div>
              </div>
              <div className="text-primary font-bold text-sm">{fmtMoney(Number(s.price))}</div>
            </Card>
          ))
        }
        {filtered?.length === 0 && <div className="text-center py-16 text-muted-foreground">لا توجد مبيعات.</div>}
      </div>
    </>
  );
}
