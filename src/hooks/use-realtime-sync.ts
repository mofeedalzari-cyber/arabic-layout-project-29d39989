import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global realtime sync.
 *
 * Performance notes:
 * - Invalidates only the query keys related to the table that changed
 *   (previously it invalidated the whole cache on every event, which caused
 *   repeated full refetches — very slow on weak connections).
 * - Debounced, and paused while the tab/app is in the background.
 * - Only refetches queries that are currently mounted.
 */
const KEYS_BY_TABLE: Record<string, string[]> = {
  packages: ["packages", "agent-packages", "dash-breakdown", "admin-stats"],
  cards: ["cards", "cards-available", "dash-breakdown", "admin-stats", "package-counts", "cabin"],
  sales: ["sales", "dash-breakdown", "admin-stats", "cabin"],
  card_requests: ["requests", "dash-breakdown", "admin-stats", "cabin"],
  join_requests: ["join-requests"],
  request_payments: ["payments", "request-payments", "dash-breakdown"],
  customers: ["customers", "customer-payments"],
  profiles: ["profiles", "agents", "user-display-names", "dash-breakdown"],
  networks: ["networks", "network", "dash-breakdown"],
};

export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();

    const flush = () => {
      timer = null;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const keys = new Set<string>();
      pending.forEach((t) => (KEYS_BY_TABLE[t] ?? []).forEach((k) => keys.add(k)));
      pending.clear();
      keys.forEach((k) =>
        qc.invalidateQueries({ queryKey: [k], refetchType: "active", exact: false }),
      );
    };

    const schedule = (table: string) => {
      pending.add(table);
      if (timer) return;
      timer = setTimeout(flush, 1200);
    };

    const channel = supabase.channel("global-sync");
    Object.keys(KEYS_BY_TABLE).forEach((table) => {
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table }, () =>
        schedule(table),
      );
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
