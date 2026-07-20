
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_non_admin_activation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_network(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_network(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_active_networks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.username_from_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon, authenticated;

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'reject_card_request(uuid, text)',
    'admin_delete_network(uuid)',
    'admin_delete_package(uuid)',
    'sell_card(uuid)',
    'set_agent_active(uuid, boolean)',
    'agent_cabin()',
    'package_counts(uuid)',
    'admin_list_cards(uuid, uuid, uuid, text, integer)',
    'admin_delete_cards(uuid[])',
    'reject_join_request(uuid, text)',
    'create_my_network(text)',
    'set_agent_network(uuid, uuid)',
    'admin_stats()',
    'approve_card_request(uuid)',
    'request_cards(uuid, integer, text, text)',
    'approve_join_request(uuid)',
    'bulk_upload_cards(uuid, jsonb)',
    'record_request_payment(uuid, numeric, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
