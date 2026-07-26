
CREATE OR REPLACE FUNCTION public.superadmin_set_network_active(_network_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.networks SET is_active = _active WHERE id = _network_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, CASE WHEN _active THEN 'ACTIVATE_NETWORK' ELSE 'SUSPEND_NETWORK' END,
          'network', _network_id, jsonb_build_object('is_active', _active));
END; $$;

REVOKE EXECUTE ON FUNCTION public.superadmin_set_network_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_set_network_active(uuid, boolean) TO authenticated;
