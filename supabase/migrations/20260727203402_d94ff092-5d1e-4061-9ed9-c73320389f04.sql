-- Allow sales history to remain after an agent account is deleted.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_agent_id_fkey;
ALTER TABLE public.sales ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_delete_agent(_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_agent record;
  v_returned_cards int := 0;
  v_sales_preserved int := 0;
  v_roles_deleted int := 0;
  v_profile_deleted int := 0;
  v_auth_deleted int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _agent_id IS NULL THEN RAISE EXCEPTION 'AGENT_ID_REQUIRED'; END IF;
  IF _agent_id = v_uid THEN RAISE EXCEPTION 'CANNOT_DELETE_SELF'; END IF;

  SELECT p.id, p.username, p.full_name, p.network_id
  INTO v_agent
  FROM public.profiles p
  WHERE p.id = _agent_id
  FOR UPDATE;

  IF NOT FOUND OR v_agent.network_id IS DISTINCT FROM v_net THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT public.has_role(_agent_id, 'agent'::public.app_role) THEN
    RAISE EXCEPTION 'NOT_AGENT';
  END IF;

  WITH returned AS (
    UPDATE public.cards
    SET status = 'AVAILABLE', assigned_to = NULL, assigned_at = NULL
    WHERE assigned_to = _agent_id
      AND network_id = v_net
      AND status = 'ASSIGNED'
    RETURNING id
  )
  SELECT count(*)::int INTO v_returned_cards FROM returned;

  WITH preserved AS (
    UPDATE public.sales
    SET agent_id = NULL
    WHERE agent_id = _agent_id
      AND network_id = v_net
    RETURNING id
  )
  SELECT count(*)::int INTO v_sales_preserved FROM preserved;

  DELETE FROM public.user_roles WHERE user_id = _agent_id;
  GET DIAGNOSTICS v_roles_deleted = ROW_COUNT;

  DELETE FROM public.profiles WHERE id = _agent_id;
  GET DIAGNOSTICS v_profile_deleted = ROW_COUNT;

  DELETE FROM auth.users WHERE id = _agent_id;
  GET DIAGNOSTICS v_auth_deleted = ROW_COUNT;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'DELETE_AGENT',
    'profile',
    _agent_id,
    jsonb_build_object(
      'username', v_agent.username,
      'full_name', v_agent.full_name,
      'network_id', v_net,
      'returned_cards', v_returned_cards,
      'sales_preserved', v_sales_preserved,
      'roles_deleted', v_roles_deleted,
      'profile_deleted', v_profile_deleted,
      'auth_deleted', v_auth_deleted
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'returned_cards', v_returned_cards,
    'sales_preserved', v_sales_preserved,
    'auth_deleted', v_auth_deleted
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_agent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_agent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_agent(uuid) TO service_role;