import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** يقرأ حالة خيار عام في التطبيق (يتحكم به مدير التطبيق فقط) */
export function useAppFlag(key: string, fallback = true) {
  const q = useQuery({
    queryKey: ["app-flag", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_flags")
        .select("enabled")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data?.enabled ?? fallback) as boolean;
    },
    staleTime: 30_000,
  });
  return { enabled: q.data ?? fallback, isLoading: q.isLoading };
}
