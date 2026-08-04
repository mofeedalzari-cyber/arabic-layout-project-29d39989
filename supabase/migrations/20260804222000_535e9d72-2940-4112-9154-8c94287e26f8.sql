CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_account_type TEXT;
  v_network_name TEXT;
  v_network_id UUID;
BEGIN
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), split_part(NEW.email,'@',1));
  v_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name','');
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone','');
  v_account_type := lower(COALESCE(NULLIF(NEW.raw_user_meta_data->>'account_type',''),'agent'));
  v_network_name := NULLIF(trim(NEW.raw_user_meta_data->>'network_name'),'');

  INSERT INTO public.profiles (id, username, full_name, phone, is_active, network_id)
  VALUES (NEW.id, v_username, v_full_name, v_phone, false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    username  = EXCLUDED.username,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone     = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  IF v_account_type = 'user' THEN
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    SELECT id INTO v_network_id FROM public.networks WHERE lower(name) = lower(v_network_name) LIMIT 1;
    IF v_network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_NOT_FOUND'; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET is_active = true, network_id = v_network_id WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_account_type = 'network' THEN
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name) = lower(v_network_name)) THEN
      RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
    END IF;
    INSERT INTO public.networks (name, owner_id, created_by, is_active)
    VALUES (v_network_name, NEW.id, NEW.id, true)
    RETURNING id INTO v_network_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET network_id = v_network_id, is_active = true WHERE id = NEW.id;
  ELSE
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    SELECT id INTO v_network_id FROM public.networks WHERE lower(name) = lower(v_network_name) LIMIT 1;
    IF v_network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_NOT_FOUND'; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.join_requests (network_id, agent_id, agent_username, agent_full_name, agent_phone)
    VALUES (v_network_id, NEW.id, v_username, v_full_name, v_phone);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_store()
RETURNS TABLE (
  package_id uuid, package_name text, network_id uuid, network_name text,
  price numeric, currency text, color text, data_size text, speed text,
  validity text, available int, admin_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, n.id, n.name, p.price, n.currency, p.color, p.data_size, p.speed,
         p.validity,
         (SELECT count(*)::int FROM public.cards c
            WHERE c.package_id = p.id AND c.status = 'AVAILABLE'),
         (SELECT pr.phone FROM public.profiles pr WHERE pr.id = n.owner_id)
  FROM public.packages p
  JOIN public.networks n ON n.id = p.network_id
  WHERE p.is_active AND n.is_active
    AND (
      n.id = (SELECT me.network_id FROM public.profiles me WHERE me.id = auth.uid())
      OR (SELECT me2.network_id FROM public.profiles me2 WHERE me2.id = auth.uid()) IS NULL
    )
  ORDER BY n.name, p.sort_order, p.price
$$;

CREATE OR REPLACE FUNCTION public.delete_my_orders(_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  DELETE FROM public.user_orders o
  WHERE o.id = ANY(_ids) AND o.user_id = auth.uid();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user_orders(_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  DELETE FROM public.user_orders o
  WHERE o.id = ANY(_ids)
    AND (public.is_superadmin(auth.uid()) OR o.network_id = public.admin_network(auth.uid()));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_orders(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_orders(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_store() TO authenticated;