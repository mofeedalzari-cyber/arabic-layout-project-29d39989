-- 1) Superadmin updates a user's phone (login identity) without service_role
CREATE OR REPLACE FUNCTION public.superadmin_update_user_phone(_user_id uuid, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _digits text;
  _username text;
  _email text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_USER_ID';
  END IF;

  _digits := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  IF length(_digits) < 6 OR length(_digits) > 20 THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;

  _username := left('u' || _digits, 30);
  _email := _username || '@wificards.local';

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = _username AND p.id <> _user_id) THEN
    RAISE EXCEPTION 'رقم الجوال مستخدم من قبل حساب آخر';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(_email) AND u.id <> _user_id) THEN
    RAISE EXCEPTION 'رقم الجوال مستخدم من قبل حساب آخر';
  END IF;

  UPDATE auth.users
     SET email = _email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = _user_id;

  UPDATE auth.identities
     SET identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(_email), true),
         updated_at = now()
   WHERE user_id = _user_id AND provider = 'email';

  UPDATE public.profiles
     SET phone = _digits, username = _username, updated_at = now()
   WHERE id = _user_id;

  UPDATE public.sales SET agent_username = _username WHERE agent_id = _user_id;
  UPDATE public.card_requests SET agent_username = _username WHERE agent_id = _user_id;
  UPDATE public.join_requests SET agent_username = _username WHERE agent_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'username', _username, 'phone', _digits);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_update_user_phone(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_update_user_phone(uuid, text) TO authenticated;

-- helper: caller's owned network
CREATE OR REPLACE FUNCTION public.my_owned_network_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id FROM public.networks n WHERE n.owner_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_owned_network_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_owned_network_id() TO authenticated;

-- 2a) wipe caller's network data before restore
CREATE OR REPLACE FUNCTION public.restore_wipe_my_network()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net uuid := public.my_owned_network_id();
BEGIN
  IF _net IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  DELETE FROM public.request_payments rp
   WHERE rp.request_id IN (SELECT id FROM public.card_requests WHERE network_id = _net);
  DELETE FROM public.sales WHERE network_id = _net;
  DELETE FROM public.card_requests WHERE network_id = _net;
  DELETE FROM public.cards WHERE network_id = _net;
  DELETE FROM public.packages WHERE network_id = _net;
  DELETE FROM public.join_requests WHERE network_id = _net;

  RETURN jsonb_build_object('ok', true, 'network_id', _net);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_wipe_my_network() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_wipe_my_network() TO authenticated;

-- 2b) create a missing agent account (inactive) inside caller's network
CREATE OR REPLACE FUNCTION public.restore_create_agent(
  _username text,
  _full_name text,
  _phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.restore_create_agent(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_create_agent(text, text, text) TO authenticated;

-- 2c) insert restored rows into whitelisted tables, forcing caller's network
CREATE OR REPLACE FUNCTION public.restore_insert_rows(_table text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net uuid := public.my_owned_network_id();
  _count integer := 0;
BEGIN
  IF _net IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RETURN 0;
  END IF;

  IF _table = 'packages' THEN
    INSERT INTO public.packages
    SELECT * FROM jsonb_populate_recordset(null::public.packages,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'cards' THEN
    INSERT INTO public.cards
    SELECT * FROM jsonb_populate_recordset(null::public.cards,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'card_requests' THEN
    INSERT INTO public.card_requests
    SELECT * FROM jsonb_populate_recordset(null::public.card_requests,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'sales' THEN
    INSERT INTO public.sales
    SELECT * FROM jsonb_populate_recordset(null::public.sales,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'join_requests' THEN
    INSERT INTO public.join_requests
    SELECT * FROM jsonb_populate_recordset(null::public.join_requests,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'request_payments' THEN
    INSERT INTO public.request_payments
    SELECT * FROM jsonb_populate_recordset(null::public.request_payments, _rows) x
     WHERE x.request_id IN (SELECT id FROM public.card_requests WHERE network_id = _net);
  ELSE
    RAISE EXCEPTION 'TABLE_NOT_ALLOWED';
  END IF;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_insert_rows(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_insert_rows(text, jsonb) TO authenticated;

-- 2d) list profiles of caller's network + all usernames (for remapping) without admin client
CREATE OR REPLACE FUNCTION public.restore_profile_index()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net uuid := public.my_owned_network_id();
BEGIN
  IF _net IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN jsonb_build_object(
    'network_profiles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username,
                                          'full_name', p.full_name, 'phone', p.phone))
        FROM public.profiles p WHERE p.network_id = _net
    ), '[]'::jsonb),
    'usernames', coalesce((
      SELECT jsonb_agg(p.username) FROM public.profiles p
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_profile_index() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_profile_index() TO authenticated;