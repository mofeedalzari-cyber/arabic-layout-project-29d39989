DROP FUNCTION IF EXISTS public.admin_transfer_sold_cards(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.admin_transfer_sold_cards(_ids uuid[], _to_agent uuid, _force_customer uuid DEFAULT NULL::uuid)
 RETURNS TABLE(moved integer, amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_to_username text;
  v_to_fullname text;
  v_to_net uuid;
  v_moved int := 0;
  v_amount numeric := 0;
  v_card RECORD;
  v_req RECORD;
  v_sale RECORD;
  v_cust_name text;
  v_cust_wa text;
  v_new_cust uuid;
  v_remaining numeric;
  v_reduce numeric;
  v_left numeric;
  v_price numeric;
  v_pkg_name text;
  v_net_name text;
  v_from_username text;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _to_agent IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED'; END IF;
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN RETURN QUERY SELECT 0, 0::numeric; RETURN; END IF;

  SELECT username, full_name, network_id INTO v_to_username, v_to_fullname, v_to_net FROM public.profiles WHERE id = _to_agent;
  IF v_to_username IS NULL OR v_to_net IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT name INTO v_net_name FROM public.networks WHERE id = v_net;

  FOR v_card IN
    SELECT c.id, c.package_id, c.sold_to, p.price, p.name AS package_name
    FROM public.cards c
    JOIN public.packages p ON p.id = c.package_id
    WHERE c.id = ANY(_ids)
      AND c.network_id = v_net
      AND c.status = 'SOLD'
      AND c.sold_to IS DISTINCT FROM _to_agent
    FOR UPDATE OF c
  LOOP
    v_price := COALESCE(v_card.price, 0);
    v_pkg_name := v_card.package_name;

    UPDATE public.cards SET sold_to = _to_agent, assigned_to = _to_agent WHERE id = v_card.id;

    v_new_cust := NULL;
    v_cust_name := NULL;
    v_cust_wa := NULL;
    v_sale := NULL;

    SELECT * INTO v_sale FROM public.sales
      WHERE card_id = v_card.id AND network_id = v_net
      ORDER BY sold_at DESC LIMIT 1;

    IF v_sale.id IS NOT NULL THEN
      IF v_sale.customer_id IS NOT NULL THEN
        SELECT name, whatsapp INTO v_cust_name, v_cust_wa
        FROM public.customers WHERE id = v_sale.customer_id;
      END IF;

      IF NULLIF(trim(COALESCE(v_cust_name,'')),'') IS NULL THEN
        v_cust_name := NULLIF(trim(COALESCE(v_sale.buyer_name,'')),'');
      END IF;

      IF _force_customer IS NOT NULL THEN
        v_new_cust := _force_customer;
      ELSIF v_cust_name IS NOT NULL THEN
        SELECT id INTO v_new_cust FROM public.customers
          WHERE agent_id = _to_agent
            AND lower(trim(name)) = lower(trim(v_cust_name))
            AND regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g')
                = regexp_replace(COALESCE(v_cust_wa,''), '\D', '', 'g')
          LIMIT 1;

        IF v_new_cust IS NULL THEN
          INSERT INTO public.customers (agent_id, network_id, name, whatsapp)
          VALUES (_to_agent, v_net, v_cust_name, COALESCE(v_cust_wa,''))
          RETURNING id INTO v_new_cust;
        END IF;
      END IF;

      UPDATE public.sales
        SET agent_id = _to_agent,
            agent_username = v_to_username,
            agent_full_name = COALESCE(v_to_fullname, agent_full_name),
            customer_id = COALESCE(v_new_cust, customer_id),
            buyer_name = COALESCE(NULLIF(trim(COALESCE(buyer_name,'')),''), v_cust_name)
        WHERE id = v_sale.id;
    END IF;

    IF v_card.sold_to IS NOT NULL AND v_price > 0 THEN
      v_left := v_price;

      FOR v_req IN
        SELECT id, total_value, paid_amount, package_id, approved_quantity
        FROM public.card_requests
        WHERE network_id = v_net
          AND agent_id = v_card.sold_to
          AND status = 'APPROVED'
          AND COALESCE(total_value,0) - COALESCE(paid_amount,0) > 0
        ORDER BY (package_id = v_card.package_id) DESC, decided_at ASC NULLS LAST, created_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_left <= 0;
        v_remaining := COALESCE(v_req.total_value,0) - COALESCE(v_req.paid_amount,0);
        v_reduce := LEAST(v_left, v_remaining);
        IF v_reduce <= 0 THEN CONTINUE; END IF;
        UPDATE public.card_requests
          SET total_value = COALESCE(total_value,0) - v_reduce,
              approved_quantity = CASE
                WHEN v_req.package_id = v_card.package_id
                  THEN GREATEST(COALESCE(approved_quantity,0) - 1, 0)
                ELSE approved_quantity END,
              updated_at = now()
          WHERE id = v_req.id;
        v_left := v_left - v_reduce;
      END LOOP;

      IF v_left > 0 THEN
        SELECT username INTO v_from_username FROM public.profiles WHERE id = v_card.sold_to;
        INSERT INTO public.card_requests(
          agent_id, agent_username, package_id, network_id, package_name, network_name,
          quantity, approved_quantity, status, payment_method, unit_price, total_value,
          paid_amount, notes, decided_by, decided_at
        ) VALUES (
          v_card.sold_to, COALESCE(v_from_username,'-'), v_card.package_id, v_net, v_pkg_name, v_net_name,
          0, 0, 'APPROVED', 'CREDIT', v_price, -v_left,
          0, 'تسوية نقل كرت مباع إلى مندوب آخر', v_uid, now()
        );
        v_left := 0;
      END IF;
    END IF;

    INSERT INTO public.card_requests(
      agent_id, agent_username, package_id, network_id, package_name, network_name,
      quantity, approved_quantity, status, payment_method, unit_price, total_value,
      paid_amount, notes, decided_by, decided_at
    ) VALUES (
      _to_agent, v_to_username, v_card.package_id, v_net, v_pkg_name, v_net_name,
      1, 1, 'APPROVED', 'CREDIT', v_price, v_price,
      0, 'نقل كرت مباع من مندوب آخر', v_uid, now()
    );

    v_moved := v_moved + 1;
    v_amount := v_amount + v_price;
  END LOOP;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'TRANSFER_SOLD_CARDS', 'cards', NULL,
          jsonb_build_object('moved', v_moved, 'amount', v_amount,
                             'to_agent', _to_agent, 'network_id', v_net));

  RETURN QUERY SELECT v_moved, v_amount;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_transfer_sold_cards(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_sold_cards(uuid[], uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_transfer_customer(_customer_id uuid, _to_agent uuid)
 RETURNS TABLE(moved_cards integer, moved_sales integer, amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_to_username text;
  v_to_fullname text;
  v_to_net uuid;
  v_cust RECORD;
  v_dup RECORD;
  v_ids uuid[];
  v_moved int := 0;
  v_amount numeric := 0;
  v_sales int := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _to_agent IS NULL OR _customer_id IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED'; END IF;

  SELECT username, full_name, network_id INTO v_to_username, v_to_fullname, v_to_net
  FROM public.profiles WHERE id = _to_agent;
  IF v_to_username IS NULL OR v_to_net IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT c.* INTO v_cust FROM public.customers c
  WHERE c.id = _customer_id
    AND (c.network_id = v_net
         OR c.agent_id IN (SELECT p.id FROM public.profiles p WHERE p.network_id = v_net))
  FOR UPDATE;
  IF v_cust.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF v_cust.agent_id = _to_agent THEN
    RETURN QUERY SELECT 0, 0, 0::numeric; RETURN;
  END IF;

  UPDATE public.customers
    SET agent_id = _to_agent, network_id = v_net, updated_at = now()
    WHERE id = _customer_id;

  SELECT array_agg(DISTINCT s.card_id) INTO v_ids
  FROM public.sales s
  JOIN public.cards cd ON cd.id = s.card_id
  WHERE s.customer_id = _customer_id
    AND s.network_id = v_net
    AND cd.status = 'SOLD'
    AND cd.sold_to IS DISTINCT FROM _to_agent;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) IS NOT NULL THEN
    SELECT t.moved, t.amount INTO v_moved, v_amount
    FROM public.admin_transfer_sold_cards(v_ids, _to_agent, _customer_id) t;
  END IF;

  UPDATE public.sales
    SET agent_id = _to_agent,
        agent_username = v_to_username,
        agent_full_name = COALESCE(v_to_fullname, agent_full_name)
    WHERE customer_id = _customer_id
      AND network_id = v_net
      AND agent_id IS DISTINCT FROM _to_agent;
  GET DIAGNOSTICS v_sales = ROW_COUNT;

  UPDATE public.customer_payments
    SET agent_id = _to_agent, network_id = v_net
    WHERE customer_id = _customer_id;

  -- merge any duplicate copy of the same customer under the receiving agent
  FOR v_dup IN
    SELECT d.id FROM public.customers d
    WHERE d.agent_id = _to_agent
      AND d.id <> _customer_id
      AND lower(trim(d.name)) = lower(trim(v_cust.name))
      AND (regexp_replace(COALESCE(d.whatsapp,''), '\D', '', 'g')
             = regexp_replace(COALESCE(v_cust.whatsapp,''), '\D', '', 'g')
           OR NULLIF(regexp_replace(COALESCE(d.whatsapp,''), '\D', '', 'g'), '') IS NULL)
  LOOP
    UPDATE public.sales SET customer_id = _customer_id WHERE customer_id = v_dup.id;
    UPDATE public.customer_payments
      SET customer_id = _customer_id, agent_id = _to_agent, network_id = v_net
      WHERE customer_id = v_dup.id;
    DELETE FROM public.customers WHERE id = v_dup.id;
  END LOOP;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'TRANSFER_CUSTOMER', 'customers', _customer_id,
          jsonb_build_object('to_agent', _to_agent, 'from_agent', v_cust.agent_id,
                             'cards', COALESCE(v_moved,0), 'amount', COALESCE(v_amount,0),
                             'network_id', v_net));

  RETURN QUERY SELECT COALESCE(v_moved,0), COALESCE(v_moved,0) + COALESCE(v_sales,0), COALESCE(v_amount,0);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_transfer_customer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_customer(uuid, uuid) TO authenticated;