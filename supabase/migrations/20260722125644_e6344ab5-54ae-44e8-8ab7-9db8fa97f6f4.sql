
-- Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions,
-- then re-grant only what the client actually needs.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Public (anon) endpoints needed by auth flow
GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon, authenticated;

-- Signed-in RPCs invoked by the app
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_network(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_card_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_card_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_join_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upload_cards(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unassign_cards(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wipe_database() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_network(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.package_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_cabin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_request_payment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_agent_debt(uuid, numeric, text) TO authenticated;

-- Trigger-only functions: no direct execute needed by any client.
-- (handle_new_user, touch_updated_at, prevent_non_admin_activation,
--  prevent_profile_privilege_escalation) stay with no client grants;
-- triggers run as table owner regardless.
