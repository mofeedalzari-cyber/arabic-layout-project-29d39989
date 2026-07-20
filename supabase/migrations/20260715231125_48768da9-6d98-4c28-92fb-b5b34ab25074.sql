
-- 1) Prevent forged log entries: remove client-side insert policy.
--    All legitimate log inserts run inside SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "logs any insert self" ON public.logs;

-- 2) Prevent self-activation on profiles: add WITH CHECK + trigger guard.
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.prevent_non_admin_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: only admins can change is_active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_non_admin_activation ON public.profiles;
CREATE TRIGGER prevent_non_admin_activation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_activation();

-- 3) Revoke anon EXECUTE on all SECURITY DEFINER functions; keep authenticated only where the app needs it.
REVOKE EXECUTE ON FUNCTION public.sell_card(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_upload_cards(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_agent_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_card_request(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agent_cabin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.package_counts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_network(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_package(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_wipe_database() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_cards(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_card_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_non_admin_activation() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sell_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upload_cards(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_card_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_cabin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.package_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wipe_database() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_cards(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_card_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;
