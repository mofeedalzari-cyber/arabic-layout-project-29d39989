CREATE OR REPLACE FUNCTION public.admin_transfer_customer_merge(_customer_id uuid, _to_agent uuid, _merge_into uuid)
RETURNS TABLE(moved_cards integer, moved_sales integer, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_net uuid := public.admin_network(auth.uid());
  r RECORD;
  v_target RECORD;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO r FROM public.admin_transfer_customer(_customer_id, _to_agent) LIMIT 1;
  IF _merge_into IS NOT NULL AND _merge_into <> _customer_id THEN
    SELECT id INTO v_target FROM public.customers WHERE id = _merge_into AND agent_id = _to_agent;
    IF v_target.id IS NOT NULL THEN
      UPDATE public.sales SET customer_id = _merge_into WHERE customer_id = _customer_id;
      UPDATE public.customer_payments SET customer_id = _merge_into, agent_id = _to_agent, network_id = v_net
        WHERE customer_id = _customer_id;
      DELETE FROM public.customers WHERE id = _customer_id;
    END IF;
  END IF;
  RETURN QUERY SELECT r.moved_cards, r.moved_sales, r.amount;
END $$;
REVOKE ALL ON FUNCTION public.admin_transfer_customer_merge(uuid,uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_customer_merge(uuid,uuid,uuid) TO authenticated;