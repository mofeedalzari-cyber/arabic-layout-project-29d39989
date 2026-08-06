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

  IF v_account_type = 'user' THEN
    RAISE EXCEPTION 'USER_SIGNUP_DISABLED';
  END IF;

  INSERT INTO public.profiles (id, username, full_name, phone, is_active, network_id)
  VALUES (NEW.id, v_username, v_full_name, v_phone, false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    username  = EXCLUDED.username,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone     = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  IF v_account_type = 'network' THEN
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name) = lower(v_network_name)) THEN
      RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
    END IF;
    -- Pending app-superadmin approval: both network and owner start inactive.
    INSERT INTO public.networks (name, owner_id, created_by, is_active)
    VALUES (v_network_name, NEW.id, NEW.id, false)
    RETURNING id INTO v_network_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET network_id = v_network_id, is_active = false WHERE id = NEW.id;
  ELSE
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    SELECT id INTO v_network_id FROM public.networks WHERE lower(name) = lower(v_network_name) AND is_active = true LIMIT 1;
    IF v_network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_NOT_FOUND'; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.join_requests (network_id, agent_id, agent_username, agent_full_name, agent_phone)
    VALUES (v_network_id, NEW.id, v_username, v_full_name, v_phone);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_set_network_active(_network_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_ID_REQUIRED'; END IF;
  UPDATE public.networks SET is_active = _active, updated_at = now() WHERE id = _network_id;
  -- Approving/suspending a network also enables/disables its owner (admin) account.
  UPDATE public.profiles p
     SET is_active = _active, updated_at = now()
   FROM public.networks n
  WHERE n.id = _network_id AND p.id = n.owner_id;
END;
$$;