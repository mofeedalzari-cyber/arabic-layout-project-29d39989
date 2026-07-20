import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Maps username -> full display name (full_name when available, else username).
 * Used across reports/stats screens so agents show by full name, not username.
 */
export function useUserNames() {
  const { data } = useQuery({
    queryKey: ["user-display-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, full_name");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) {
        m.set(p.username, (p.full_name && p.full_name.trim()) || p.username);
      }
      return m;
    },
    staleTime: 60_000,
  });
  const map = data ?? new Map<string, string>();
  return {
    map,
    display: (username?: string | null) =>
      (username && map.get(username)) || username || "—",
  };
}
