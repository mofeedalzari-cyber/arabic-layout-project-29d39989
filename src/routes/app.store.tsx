import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { PackageOpen, Wifi, MessageCircle, ShoppingCart, Clock } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/store")({ component: StorePage });

interface StoreRow {
  package_id: string;
  package_name: string;
  network_id: string;
  network_name: string;
  price: number;
  currency: string;
  color: string | null;
  data_size: string | null;
  speed: string | null;
  validity: string | null;
  available: number;
  admin_phone: string | null;
}

function StorePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["user-store"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("user_store");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  async function buy(row: StoreRow) {
    setBusy(row.package_id);
    const { data, error } = await (supabase.rpc as any)("user_create_order", {
      _package_id: row.package_id,
    });
    setBusy(null);
    if (error) {
      const m = String(error.message ?? "");
      if (m.includes("NO_CARDS_AVAILABLE")) return toast.error("لا توجد كروت متاحة لهذه الباقة");
      return toast.error("تعذر إنشاء الطلب");
    }
    navigate({ to: "/app/topup", search: { order: String(data) } });
  }

  function whatsapp(row: StoreRow) {
    const digits = (row.admin_phone ?? "").replace(/\D/g, "");
    if (!digits) return toast.error("لا يوجد رقم واتساب للمدير");
    const text = `مرحبًا، أريد طلب كرت من باقة «${row.package_name}» — شبكة ${row.network_name} بسعر ${row.price}`;
    window.open(
      `https://wa.me/${digits.startsWith("00") ? digits.slice(2) : digits}?text=${encodeURIComponent(text)}`,
      "_blank",
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader title="المتجر" description="اختر الباقة واشترِ كرتك مباشرة" />

      {isLoading ? (
        <div className="text-center text-muted-foreground py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <PackageOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">لا توجد باقات متاحة حاليًا</p>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const c = r.color && r.color !== "none" ? r.color : null;
            return (
              <Card
                key={r.package_id}
                className="p-4 rounded-2xl border-0 shadow-md text-right"
                style={
                  c
                    ? { background: `linear-gradient(135deg, ${c} 0%, ${c}cc 100%)`, color: "#fff" }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl font-extrabold">{fmtMoney(Number(r.price))}</span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold truncate">{r.package_name}</h3>
                    <p className="text-xs opacity-80 flex items-center gap-1 justify-end">
                      <span className="truncate">{r.network_name}</span>
                      <Wifi className="h-3.5 w-3.5" />
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end mt-3 text-[11px] opacity-90">
                  {r.data_size && <Badge>{r.data_size}</Badge>}
                  {r.speed && <Badge>{r.speed}</Badge>}
                  {r.validity && (
                    <Badge>
                      <Clock className="h-3 w-3 inline ml-1" />
                      {r.validity}
                    </Badge>
                  )}
                  <Badge>{r.available > 0 ? `متاح ${r.available}` : "غير متاح"}</Badge>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    className="flex-1 rounded-xl bg-[#22a06b] hover:bg-[#1c8a5b] text-white"
                    disabled={r.available <= 0 || busy === r.package_id}
                    onClick={() => void buy(r)}
                  >
                    <ShoppingCart className="h-4 w-4 ml-1" />
                    {busy === r.package_id ? "…" : "شراء الآن"}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => whatsapp(r)}
                    aria-label="طلب عبر واتساب"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-black/10 px-2 py-0.5">{children}</span>;
}
