CREATE OR REPLACE FUNCTION public.admin_merge_customers(_source uuid, _target uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_net uuid := public.admin_network(auth.uid());
  s RECORD; t RECORD; v_agent text;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _source = _target THEN RAISE EXCEPTION 'SAME_CUSTOMER'; END IF;
  SELECT c.* INTO s FROM customers c JOIN profiles p ON p.id=c.agent_id WHERE c.id=_source AND p.network_id=v_net;
  SELECT c.* INTO t FROM customers c JOIN profiles p ON p.id=c.agent_id WHERE c.id=_target AND p.network_id=v_net;
  IF s.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF s.agent_id <> t.agent_id THEN RAISE EXCEPTION 'DIFFERENT_AGENT'; END IF;
  SELECT coalesce(nullif(full_name,''), username) INTO v_agent FROM profiles WHERE id=t.agent_id;
  UPDATE sales SET customer_id=_target WHERE customer_id=_source;
  UPDATE customer_payments SET customer_id=_target WHERE customer_id=_source;
  IF coalesce(t.whatsapp,'')='' AND coalesce(s.whatsapp,'')<>'' THEN
    UPDATE customers SET whatsapp=s.whatsapp WHERE id=_target;
  END IF;
  DELETE FROM customers WHERE id=_source;
  INSERT INTO logs(user_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(),'ADMIN_MERGE_CUSTOMERS','customer',_target, jsonb_build_object(
    'source',_source,'source_name',s.name,'source_whatsapp',s.whatsapp,
    'source_agent_id',s.agent_id,'source_agent_name',v_agent,
    'target_name',t.name,'target_whatsapp',t.whatsapp,'agent_id',t.agent_id,'agent_name',v_agent));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_transfer_customer_merge(_customer_id uuid, _to_agent uuid, _merge_into uuid)
 RETURNS TABLE(moved_cards integer, moved_sales integer, amount numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_net uuid := public.admin_network(auth.uid());
  r RECORD; v_target RECORD; s RECORD; v_from text; v_to text;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO s FROM public.customers WHERE id=_customer_id;
  SELECT coalesce(nullif(full_name,''), username) INTO v_from FROM profiles WHERE id=s.agent_id;
  SELECT coalesce(nullif(full_name,''), username) INTO v_to FROM profiles WHERE id=_to_agent;
  SELECT * INTO r FROM public.admin_transfer_customer(_customer_id, _to_agent) LIMIT 1;
  IF _merge_into IS NOT NULL AND _merge_into <> _customer_id THEN
    SELECT id, name, whatsapp INTO v_target FROM public.customers WHERE id = _merge_into AND agent_id = _to_agent;
    IF v_target.id IS NOT NULL THEN
      UPDATE public.sales SET customer_id = _merge_into WHERE customer_id = _customer_id;
      UPDATE public.customer_payments SET customer_id = _merge_into, agent_id = _to_agent, network_id = v_net
        WHERE customer_id = _customer_id;
      DELETE FROM public.customers WHERE id = _customer_id;
      INSERT INTO logs(user_id, action, entity, entity_id, metadata)
      VALUES (auth.uid(),'ADMIN_MERGE_CUSTOMERS','customer',_merge_into, jsonb_build_object(
        'source',_customer_id,'source_name',s.name,'source_whatsapp',s.whatsapp,
        'source_agent_id',s.agent_id,'source_agent_name',v_from,
        'target_name',v_target.name,'target_whatsapp',v_target.whatsapp,'agent_id',_to_agent,'agent_name',v_to));
    END IF;
  END IF;
  RETURN QUERY SELECT r.moved_cards, r.moved_sales, r.amount;
END $function$;