
-- 1) Prevent non-admin users from self-activating or moving networks.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id = auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change is_active on own profile';
    END IF;
    IF NEW.network_id IS DISTINCT FROM OLD.network_id THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change network_id on own profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Lock down SECURITY DEFINER function execution: revoke from anon/public,
--    keep authenticated only for functions that need it. Leave truly public
--    helpers callable by anon.
REVOKE EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_network(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_package(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_network(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_wipe_database() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agent_cabin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_card_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_upload_cards(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_my_network(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.package_counts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_request_payment(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_card_request(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_join_request(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sell_card(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_agent_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_agent_network(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_non_admin_activation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;

-- These two are meant to be callable by unauthenticated users (registration/login flows).
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon, authenticated;
