import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Inbox, UserPlus, ShieldAlert, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { setAppBadge } from "@/lib/app-badge";

export function NotificationsButton() {
  const { role, profile, isSuperadmin } = useAuth();
  const [open, setOpen] = useState(false);

  const networkId = profile?.network_id ?? null;

  const { data: counts = { total: 0, requests: 0, joins: 0, pendingAgent: 0, inactiveNetworks: 0 } } =
    useQuery({
      queryKey: ["notifications-count", role, networkId, profile?.id, isSuperadmin],
      queryFn: async () => {
        const base = { total: 0, requests: 0, joins: 0, pendingAgent: 0, inactiveNetworks: 0 };

        if (isSuperadmin) {
          const { count } = await supabase
            .from("networks")
            .select("id", { count: "exact", head: true })
            .eq("is_active", false);
          base.inactiveNetworks = count ?? 0;
          base.total = base.inactiveNetworks;
          return base;
        }

        if (role === "admin" && networkId) {
          const [{ count: reqCount }, { count: joinCount }] = await Promise.all([
            supabase
              .from("card_requests")
              .select("id", { count: "exact", head: true })
              .eq("network_id", networkId)
              .eq("status", "PENDING"),
            supabase
              .from("join_requests")
              .select("id", { count: "exact", head: true })
              .eq("network_id", networkId)
              .eq("status", "PENDING"),
          ]);
          base.requests = reqCount ?? 0;
          base.joins = joinCount ?? 0;
          base.total = base.requests + base.joins;
          return base;
        }

        if (role === "agent" && profile?.id) {
          const { count } = await supabase
            .from("card_requests")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", profile.id)
            .eq("status", "PENDING");
          base.pendingAgent = count ?? 0;
          base.total = base.pendingAgent;
          return base;
        }

        return base;
      },
      refetchInterval: 15_000,
      enabled: !!profile,
    });

  // شارة العدد على أيقونة التطبيق (مثل فيسبوك)
  useEffect(() => {
    void setAppBadge(counts.total);
  }, [counts.total]);

  const items: { to: string; label: string; count: number; icon: typeof Inbox }[] = [];

  if (isSuperadmin) {
    items.push({
      to: "/app/superadmin",
      label: "شبكات بانتظار الموافقة",
      count: counts.inactiveNetworks,
      icon: ShieldAlert,
    });
  } else if (role === "admin" && networkId) {
    items.push({
      to: "/app/requests",
      label: "طلبات سحب كروت",
      count: counts.requests,
      icon: CreditCard,
    });
    items.push({
      to: "/app/join-requests",
      label: "طلبات انضمام مندوبين",
      count: counts.joins,
      icon: UserPlus,
    });
  } else if (role === "agent") {
    items.push({
      to: "/app/requests",
      label: "طلباتي قيد الانتظار",
      count: counts.pendingAgent,
      icon: CreditCard,
    });
  }

  if (items.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-xl relative" aria-label="الإشعارات">
          <Bell className="h-5 w-5" />
          {counts.total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {counts.total > 99 ? "99+" : counts.total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-right">الإشعارات</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <DropdownMenuItem key={it.to} asChild className="text-right cursor-pointer">
              <Link to={it.to} onClick={() => setOpen(false)} className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{it.label}</span>
                </div>
                {it.count > 0 && (
                  <span className="mr-auto ml-0 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                    {it.count}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
        {items.every((it) => it.count === 0) && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            لا توجد إشعارات جديدة
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
