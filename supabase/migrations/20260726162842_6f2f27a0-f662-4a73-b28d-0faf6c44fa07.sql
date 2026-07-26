
CREATE OR REPLACE FUNCTION public.delete_sale(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_sale RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  -- Allow: the selling agent, or the admin of the sale's network
  IF v_sale.agent_id <> v_uid AND (v_net IS NULL OR v_sale.network_id <> v_net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Revert the card: if agent still exists in network, put back as ASSIGNED to them, else AVAILABLE
  UPDATE public.cards
     SET status = CASE
                    WHEN v_sale.agent_id IS NOT NULL
                     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id)
                    THEN 'ASSIGNED'::card_status
                    ELSE 'AVAILABLE'::card_status
                  END,
         sold_to = NULL,
         sold_at = NULL,
         assigned_to = CASE
                         WHEN v_sale.agent_id IS NOT NULL
                          AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id)
                         THEN v_sale.agent_id
                         ELSE NULL
                       END,
         assigned_at = CASE
                         WHEN v_sale.agent_id IS NOT NULL
                          AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id)
                         THEN now()
                         ELSE NULL
                       END
   WHERE id = v_sale.card_id;

  DELETE FROM public.sales WHERE id = _sale_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'DELETE_SALE', 'sale', _sale_id,
          jsonb_build_object('transaction_no', v_sale.transaction_no,
                             'package', v_sale.package_name,
                             'price', v_sale.price,
                             'agent_id', v_sale.agent_id));
END;
$$;

-- Allow agents to update price on their sales too (admin already covered via existing policy? add one)
CREATE POLICY "admin update sales in network"
ON public.sales FOR UPDATE
USING (network_id = public.admin_network(auth.uid()))
WITH CHECK (network_id = public.admin_network(auth.uid()));
