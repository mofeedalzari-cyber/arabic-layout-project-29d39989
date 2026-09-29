import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Store, UserPlus, Copy } from "lucide-react";

export const Route = createFileRoute("/app/admin-cabin")({
  head: () => ({
    meta: [
      { title: "كبينة بيع المدير" },
      { name: "description", content: "بيع كروت المناديب لزبائنهم من حساب مدير الشبكة" },
      { property: "og:title", content: "كبينة بيع المدير" },
      { property: "og:description", content: "بيع كروت المناديب لزبائنهم من حساب مدير الشبكة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCabin,
});

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: any; error: { message: string } | null }>;

function AdminCabin() {
  const qc = useQueryClient();
  const [agent, setAgent] = useState("");
  const [customer, setCustomer] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [selling, setSelling] = useState<string | null>(null);
  const [last, setLast] = useState<any>(null);

  const { data: agents } = useQuery({
    queryKey: ["admin-cabin-agents"],
    queryFn: async () => {
      const { data, error } = await rpc("admin_cabin_agents");
      if (error) throw error;
      return (data ?? []) as { id: string; username: string; full_name: string | null }[];
    },
  });
  const { data: pkgs, isLoading: pkgLoading } = useQuery({
    queryKey: ["admin-cabin-pkgs", agent],
    enabled: !!agent,
    queryFn: async () => {
      const { data, error } = await rpc("admin_agent_cabin", { _agent: agent });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: customers } = useQuery({
    queryKey: ["admin-cabin-customers", agent],
    enabled: !!agent,
    queryFn: async () => {
      const { data, error } = await rpc("admin_agent_customers", { _agent: agent });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; whatsapp: string }[];
    },
  });

  const filtered = (customers ?? []).filter(
    (c) => !custSearch || c.name.includes(custSearch) || c.whatsapp.includes(custSearch),
  );
  const selCust = customers?.find((c) => c.id === customer);

  async function addCustomer() {
    if (!newName.trim()) return toast.error("أدخل اسم الزبون");
    setAdding(true);
    const { data, error } = await rpc("admin_add_agent_customer", {
      _agent: agent,
      _name: newName,
      _whatsapp: newPhone,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["admin-cabin-customers", agent] });
    setCustomer(data as string);
    setNewName("");
    setNewPhone("");
    toast.success("تمت إضافة الزبون");
  }

  async function sell(pkgId: string) {
    setSelling(pkgId);
    const { data, error } = await rpc("admin_sell_for_agent", {
      _agent: agent,
      _package_id: pkgId,
      _customer_id: customer || null,
    });
    setSelling(null);
    if (error) {
      return toast.error(error.message.includes("NO_CARDS") ? "لا توجد كروت متاحة لدى المندوب" : error.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    setLast(row);
    toast.success("تم البيع");
    qc.invalidateQueries({ queryKey: ["admin-cabin-pkgs", agent] });
  }

  function whatsapp() {
    if (!last || !selCust?.whatsapp) return;
    const msg = `كرت ${last.package_name}\nرقم الكرت: ${last.card_username}${last.card_password ? `\nكلمة المرور: ${last.card_password}` : ""}`;
    const phone = selCust.whatsapp.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Store className="h-6 w-6" /> كبينة بيع المدير
      </h1>

      <Card className="space-y-3 p-4">
        <label className="text-sm font-medium">المندوب</label>
        <select
          className="h-11 w-full rounded-xl border bg-background px-3"
          value={agent}
          onChange={(e) => {
            setAgent(e.target.value);
            setCustomer("");
            setLast(null);
          }}
        >
          <option value="">اختر المندوب</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name || a.username}
            </option>
          ))}
        </select>
      </Card>

      {agent && (
        <Card className="space-y-3 p-4">
          <label className="text-sm font-medium">الزبون ({customers?.length ?? 0})</label>
          <Input placeholder="بحث بالاسم أو الرقم" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
          <select
            className="h-11 w-full rounded-xl border bg-background px-3"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">بدون زبون</option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.whatsapp ? `— ${c.whatsapp}` : ""}
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="اسم زبون جديد" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="رقم الواتساب" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} inputMode="tel" />
            <Button onClick={addCustomer} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} إضافة زبون
            </Button>
          </div>
        </Card>
      )}

      {last && (
        <Card className="space-y-2 border-primary p-4">
          <div className="font-bold">تم بيع كرت {last.package_name}</div>
          <div className="flex items-center gap-2 font-mono text-lg">
            {last.card_username}
            <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(last.card_username)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {last.card_password && <div className="font-mono">كلمة المرور: {last.card_password}</div>}
          {selCust?.whatsapp && <Button onClick={whatsapp}>إرسال للزبون واتساب</Button>}
        </Card>
      )}

      {agent && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {pkgLoading && <Loader2 className="h-6 w-6 animate-spin" />}
          {!pkgLoading && !pkgs?.length && (
            <div className="col-span-full text-muted-foreground">لا توجد كروت مسحوبة لدى هذا المندوب</div>
          )}
          {pkgs?.map((p) => (
            <Card key={p.package_id} className="space-y-2 p-4" style={p.color ? { borderColor: p.color } : undefined}>
              <div className="font-bold">{p.package_name}</div>
              <div className="text-sm text-muted-foreground">
                {p.price} {p.currency} · المتاح {p.available}
              </div>
              <Button className="w-full" disabled={!!selling || p.available < 1} onClick={() => sell(p.package_id)}>
                {selling === p.package_id ? <Loader2 className="h-4 w-4 animate-spin" /> : "بيع"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
