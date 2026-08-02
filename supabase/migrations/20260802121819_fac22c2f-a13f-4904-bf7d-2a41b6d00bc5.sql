CREATE OR REPLACE FUNCTION public.superadmin_set_agent_active(_agent_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _agent_id IS NULL THEN RAISE EXCEPTION 'AGENT_ID_REQUIRED'; END IF;
  IF public.is_superadmin(_agent_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.profiles SET is_active = _active, updated_at = now() WHERE id = _agent_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), CASE WHEN _active THEN 'SA_ACTIVATE_USER' ELSE 'SA_DEACTIVATE_USER' END,
          'profile', _agent_id, jsonb_build_object('active', _active));
END;
$function$;

CREATE OR REPLACE FUNCTION public.superadmin_update_network(_network_id uuid, _name text DEFAULT NULL, _currency text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_name text := NULLIF(trim(COALESCE(_name,'')),'');
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_ID_REQUIRED'; END IF;
  IF v_name IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.networks WHERE lower(name)=lower(v_name) AND id <> _network_id
  ) THEN RAISE EXCEPTION 'NETWORK_NAME_TAKEN'; END IF;

  UPDATE public.networks
  SET name = COALESCE(v_name, name),
      currency = COALESCE(NULLIF(trim(COALESCE(_currency,'')),''), currency),
      updated_at = now()
  WHERE id = _network_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), 'SA_UPDATE_NETWORK', 'network', _network_id,
          jsonb_build_object('name', v_name, 'currency', _currency));
END;
$function$;

CREATE OR REPLACE FUNCTION public.superadmin_delete_agent(_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_agent record;
  v_returned_cards int := 0;
  v_sales_preserved int := 0;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _agent_id IS NULL THEN RAISE EXCEPTION 'AGENT_ID_REQUIRED'; END IF;
  IF _agent_id = v_uid OR public.is_superadmin(_agent_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT p.id, p.username, p.full_name, p.network_id INTO v_agent
  FROM public.profiles p WHERE p.id = _agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  WITH returned AS (
    UPDATE public.cards
    SET status = 'AVAILABLE', assigned_to = NULL, assigned_at = NULL
    WHERE assigned_to = _agent_id AND status = 'ASSIGNED'
    RETURNING id
  ) SELECT count(*)::int INTO v_returned_cards FROM returned;

  WITH preserved AS (
    UPDATE public.sales SET agent_id = NULL WHERE agent_id = _agent_id RETURNING id
  ) SELECT count(*)::int INTO v_sales_preserved FROM preserved;

  DELETE FROM public.user_roles WHERE user_id = _agent_id;
  DELETE FROM public.profiles WHERE id = _agent_id;
  DELETE FROM auth.users WHERE id = _agent_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'SA_DELETE_USER', 'profile', _agent_id,
          jsonb_build_object('username', v_agent.username, 'full_name', v_agent.full_name,
                             'network_id', v_agent.network_id,
                             'returned_cards', v_returned_cards,
                             'sales_preserved', v_sales_preserved));

  RETURN jsonb_build_object('ok', true, 'returned_cards', v_returned_cards, 'sales_preserved', v_sales_preserved);
END;
$function$;