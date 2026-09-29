CREATE OR REPLACE FUNCTION public.admin_merge_customers(_source uuid, _target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_net uuid := public.admin_network(auth.uid());
  s RECORD; t RECORD;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _source = _target THEN RAISE EXCEPTION 'SAME_CUSTOMER'; END IF;
  SELECT c.* INTO s FROM customers c JOIN profiles p ON p.id=c.agent_id WHERE c.id=_source AND p.network_id=v_net;
  SELECT c.* INTO t FROM customers c JOIN profiles p ON p.id=c.agent_id WHERE c.id=_target AND p.network_id=v_net;
  IF s.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF s.agent_id <> t.agent_id THEN RAISE EXCEPTION 'DIFFERENT_AGENT'; END IF;
  UPDATE sales SET customer_id=_target WHERE customer_id=_source;
  UPDATE customer_payments SET customer_id=_target WHERE customer_id=_source;
  IF coalesce(t.whatsapp,'')='' AND coalesce(s.whatsapp,'')<>'' THEN
    UPDATE customers SET whatsapp=s.whatsapp WHERE id=_target;
  END IF;
  DELETE FROM customers WHERE id=_source;
  INSERT INTO logs(user_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(),'ADMIN_MERGE_CUSTOMERS','customer',_target, jsonb_build_object('source',_source,'source_name',s.name));
END $$;
REVOKE ALL ON FUNCTION public.admin_merge_customers(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_merge_customers(uuid,uuid) TO authenticated;