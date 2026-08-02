import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cleanPhoneLike } from "@/lib/format";

/**
 * Maps username -> full display name (full_name when available, else username),
 * plus user id -> display name.
 *
 * The id map matters because historical rows (e.g. sales.agent_username) store a
 * snapshot of the username. When an agent's phone changes, their username changes
 * too, so the old snapshot no longer matches any profile and the UI used to fall
 * back to showing raw phone digits.
 */
export function useUserNames() {
  const { data } = useQuery({
    queryKey: ["user-display-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, username, full_name");
      if (error) throw error;
      const byUsername = new Map<string, string>();
      const byId = new Map<string, string>();
      for (const p of data ?? []) {
        const name = (p.full_name && p.full_name.trim()) || cleanPhoneLike(p.username);
        byUsername.set(p.username, name);
        byId.set(p.id, name);
      }
      return { byUsername, byId };
    },
    staleTime: 60_000,
  });
  const map = data?.byUsername ?? new Map<string, string>();
  const byId = data?.byId ?? new Map<string, string>();
  return {
    map,
    byId,
    display: (username?: string | null, userId?: string | null) =>
      (userId && byId.get(userId)) ||
      (username && map.get(username)) ||
      cleanPhoneLike(username) ||
      "—",
  };
}
