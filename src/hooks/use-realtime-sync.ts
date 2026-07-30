import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global realtime sync: listens to changes on all key tables and invalidates
 * the react-query cache so UI updates automatically without manual refresh.
 */
const TABLES = [
  "packages",
  "cards",
  "sales",
  "card_requests",
  "join_requests",
  "request_payments",
  "customers",
  "profiles",
  "networks",
] as const;

export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries();
      }, 250);
    };

    const channel = supabase.channel("global-sync");
    TABLES.forEach((table) => {
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table }, () =>
        scheduleInvalidate(),
      );
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
