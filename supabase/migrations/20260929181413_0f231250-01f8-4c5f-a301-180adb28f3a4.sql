CREATE OR REPLACE FUNCTION public.admin_cabin_agents()
RETURNS TABLE(id uuid, username text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.username, p.full_name FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'agent'
  WHERE p.network_id = public.my_owned_network_id() AND public.has_role(auth.uid(),'admin')
  ORDER BY COALESCE(p.full_name,p.username);
$$;

CREATE OR REPLACE FUNCTION public._admin_check_agent(_agent uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_agent AND network_id = public.my_owned_network_id()) THEN
    RAISE EXCEPTION 'AGENT_NOT_IN_NETWORK'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_agent_cabin(_agent uuid)
RETURNS TABLE(package_id uuid, package_name text, price numeric, color text, currency text, available integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public._admin_check_agent(_agent);
  RETURN QUERY SELECT p.id, p.name, p.price, p.color, n.currency, count(*)::int
    FROM public.cards c JOIN public.packages p ON p.id=c.package_id JOIN public.networks n ON n.id=p.network_id
    WHERE c.assigned_to=_agent AND c.status='ASSIGNED'
    GROUP BY p.id, p.name, p.price, p.color, n.currency, p.sort_order
    ORDER BY p.sort_order, p.name;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_agent_customers(_agent uuid)
RETURNS TABLE(id uuid, name text, whatsapp text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public._admin_check_agent(_agent);
  RETURN QUERY SELECT c.id, c.name, c.whatsapp FROM public.customers c WHERE c.agent_id=_agent ORDER BY c.name;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_add_agent_customer(_agent uuid, _name text, _whatsapp text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._admin_check_agent(_agent);
  IF coalesce(trim(_name),'')='' THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  INSERT INTO public.customers(agent_id, network_id, name, whatsapp)
  VALUES (_agent, public.my_owned_network_id(), trim(_name), coalesce(trim(_whatsapp),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_sell_for_agent(_agent uuid, _package_id uuid, _customer_id uuid)
RETURNS TABLE(sale_id uuid, transaction_no text, card_username text, card_password text, package_name text, price numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_card record; v_pkg record; v_net record; v_prof record; v_cust record; v_sid uuid; v_tx text; v_admin text;
BEGIN
  PERFORM public._admin_check_agent(_agent);
  SELECT * INTO v_prof FROM public.profiles WHERE id=_agent;
  SELECT username INTO v_admin FROM public.profiles WHERE id=auth.uid();
  SELECT * INTO v_pkg FROM public.packages WHERE id=_package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id=v_pkg.network_id;
  IF _customer_id IS NOT NULL THEN
    SELECT * INTO v_cust FROM public.customers WHERE id=_customer_id AND agent_id=_agent;
    IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  END IF;
  SELECT * INTO v_card FROM public.cards WHERE package_id=_package_id AND status='ASSIGNED' AND assigned_to=_agent
    ORDER BY assigned_at ASC NULLS LAST, created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CARDS_AVAILABLE'; END IF;
  UPDATE public.cards SET status='SOLD', sold_to=_agent, sold_at=now() WHERE id=v_card.id;
  INSERT INTO public.sales(card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username, agent_full_name, customer_id, buyer_name)
  VALUES (v_card.id, v_pkg.id, v_net.id, _agent, v_pkg.price, v_pkg.name, v_net.name, v_prof.username, COALESCE(v_prof.full_name, v_prof.username),
          _customer_id, CASE WHEN _customer_id IS NOT NULL THEN v_cust.name END)
  RETURNING public.sales.id, public.sales.transaction_no INTO v_sid, v_tx;
  INSERT INTO public.logs(user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (auth.uid(), v_admin, 'ADMIN_SELL_FOR_AGENT', 'sale', v_sid, jsonb_build_object('agent', v_prof.username, 'package', v_pkg.name, 'price', v_pkg.price));
  RETURN QUERY SELECT v_sid, v_tx, v_card.username, v_card.password, v_pkg.name, v_pkg.price;
END; $$;

REVOKE EXECUTE ON FUNCTION public._admin_check_agent(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_cabin_agents(), public.admin_agent_cabin(uuid), public.admin_agent_customers(uuid), public.admin_add_agent_customer(uuid,text,text), public.admin_sell_for_agent(uuid,uuid,uuid), public._admin_check_agent(uuid) TO authenticated;