
-- Revoke public EXECUTE on SECURITY DEFINER functions that are not meant to be
-- called via the Data API. Trigger functions and internal helpers used only
-- inside other SECURITY DEFINER routines / RLS policies do not need anon or
-- authenticated EXECUTE.

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_non_admin_activation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_network(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon, authenticated;

-- has_role is invoked by RLS (runs regardless of grants) but also directly by
-- server code as an authenticated user; keep authenticated EXECUTE, revoke anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- username_from_phone is called by anonymous users during phone login — keep as-is.

-- Restrict admin-only RPCs to authenticated only (no anon).
REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_cards(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_cards(uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_network(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_package(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wipe_database() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_card_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_card_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_join_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_join_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_upload_cards(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_my_network(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_request_payment(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_cards(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sell_card(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_agent_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_agent_network(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_cabin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.package_counts(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wipe_database() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_card_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_card_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_join_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upload_cards(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_network(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_request_payment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_network(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_cabin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.package_counts(uuid) TO authenticated;

-- list_active_networks is used on the sign-up screen by anonymous users; keep anon.
REVOKE ALL ON FUNCTION public.list_active_networks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon, authenticated;
