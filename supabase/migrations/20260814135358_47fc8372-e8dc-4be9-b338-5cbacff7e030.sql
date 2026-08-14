CREATE OR REPLACE FUNCTION public.admin_update_agent(
  _agent_id uuid,
  _full_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _password text DEFAULT NULL,
  _update_full_name boolean DEFAULT false,
  _update_phone boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _network_id uuid;
  _old_username text;
  _digits text;
  _new_username text;
  _new_email text;
BEGIN
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT id INTO _network_id
  FROM public.networks
  WHERE owner_id = _caller_id
  LIMIT 1;

  IF _network_id IS NULL THEN
    RAISE EXCEPTION 'NO_NETWORK';
  END IF;

  SELECT username INTO _old_username
  FROM public.profiles
  WHERE id = _agent_id AND network_id = _network_id;

  IF _old_username IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _password IS NOT NULL AND length(_password) > 0 AND length(_password) < 6 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT';
  END IF;

  IF _update_phone THEN
    _digits := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
    IF length(_digits) < 6 OR length(_digits) > 20 THEN
      RAISE EXCEPTION 'INVALID_PHONE';
    END IF;

    _new_username := left('u' || _digits, 30);
    _new_email := _new_username || '@wificards.local';

    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE username = _new_username AND id <> _agent_id
    ) THEN
      RAISE EXCEPTION 'رقم الجوال مستخدم من قبل حساب آخر';
    END IF;

    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE lower(email) = lower(_new_email) AND id <> _agent_id
    ) THEN
      RAISE EXCEPTION 'رقم الجوال مستخدم من قبل حساب آخر';
    END IF;

    UPDATE auth.users
    SET email = _new_email,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = _agent_id;

    UPDATE public.profiles
    SET phone = _digits, username = _new_username
    WHERE id = _agent_id;

    UPDATE public.sales SET agent_username = _new_username WHERE agent_id = _agent_id;
    UPDATE public.card_requests SET agent_username = _new_username WHERE agent_id = _agent_id;
    UPDATE public.join_requests SET agent_username = _new_username WHERE agent_id = _agent_id;
  END IF;

  IF _update_full_name THEN
    UPDATE public.profiles
    SET full_name = nullif(btrim(coalesce(_full_name, '')), '')
    WHERE id = _agent_id;
  END IF;

  IF _password IS NOT NULL AND length(_password) > 0 THEN
    UPDATE auth.users
    SET encrypted_password = crypt(_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = _agent_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_agent(uuid, text, text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_agent(uuid, text, text, text, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_agent(uuid, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_agent(uuid, text, text, text, boolean, boolean) TO service_role;