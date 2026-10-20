CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Agents recreated by restore_create_agent: that function sets a
  -- transaction-local flag (not settable through public signup) and itself
  -- assigns network, role and profile.
  IF coalesce(current_setting('app.restore_agent', true), '') = 'on' THEN
    INSERT INTO public.profiles (id, username, full_name, phone, is_active, network_id)
    VALUES (NEW.id, v_username, v_full_name, v_phone, false, NULL)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.restore_create_agent(_username text, _full_name text, _phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  _net uuid := public.my_owned_network_id();
  _uid uuid := gen_random_uuid();
  _email text;
  _pwd text := encode(gen_random_bytes(24), 'hex');
BEGIN
  IF _net IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF coalesce(btrim(_username), '') = '' THEN
    RAISE EXCEPTION 'MISSING_USERNAME';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) THEN
    RAISE EXCEPTION 'USERNAME_TAKEN';
  END IF;

  _email := _username || '@karati.local';

  PERFORM set_config('app.restore_agent', 'on', true);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', _uid, 'authenticated', 'authenticated',
    _email, extensions.crypt(_pwd, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', _username, 'full_name', _full_name, 'phone', _phone, 'account_type', 'agent'),
    now(), now()
  );

  PERFORM set_config('app.restore_agent', 'off', true);

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  VALUES (gen_random_uuid(), _uid, _uid::text, 'email',
          jsonb_build_object('sub', _uid::text, 'email', _email, 'email_verified', true),
          now(), now());

  INSERT INTO public.profiles (id, username, full_name, phone, network_id, is_active)
  VALUES (_uid, _username, _full_name, _phone, _net, false)
  ON CONFLICT (id) DO UPDATE
    SET username = excluded.username,
        full_name = excluded.full_name,
        phone = excluded.phone,
        network_id = excluded.network_id,
        is_active = false,
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.join_requests WHERE network_id = _net AND agent_id = _uid;

  RETURN _uid;
END;
$function$;