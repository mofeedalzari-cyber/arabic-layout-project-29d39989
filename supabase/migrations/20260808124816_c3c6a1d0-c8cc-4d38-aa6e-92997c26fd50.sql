-- 1) Least privilege on all public functions: no PUBLIC/anon execute by default.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

-- Allowlist: functions the sign-in / recovery flow needs before authentication.
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon;
GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_password_reset_request(text, text) TO anon;

-- 2) Brute-force protection for phone/password sign-in.
CREATE TABLE IF NOT EXISTS public.login_attempts (
  phone_key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

GRANT ALL ON public.login_attempts TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: reachable only through the security-definer guards below.

CREATE OR REPLACE FUNCTION public.login_guard_check(_phone text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  v record;
BEGIN
  IF k = '' THEN RETURN 0; END IF;
  SELECT * INTO v FROM public.login_attempts WHERE phone_key = k;
  IF v.phone_key IS NULL OR v.locked_until IS NULL OR v.locked_until <= now() THEN
    RETURN 0;
  END IF;
  RETURN greatest(1, ceil(extract(epoch FROM (v.locked_until - now())))::int);
END;
$$;

CREATE OR REPLACE FUNCTION public.login_guard_record(_phone text, _ok boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  v record;
  n integer := 1;
  lock_secs integer := 0;
BEGIN
  IF k = '' THEN RETURN 0; END IF;

  IF _ok THEN
    DELETE FROM public.login_attempts WHERE phone_key = k;
    RETURN 0;
  END IF;

  SELECT * INTO v FROM public.login_attempts WHERE phone_key = k;

  IF v.phone_key IS NULL THEN
    INSERT INTO public.login_attempts(phone_key, attempts) VALUES (k, 1);
    n := 1;
  ELSIF v.first_attempt_at < now() - interval '15 minutes' THEN
    UPDATE public.login_attempts
       SET attempts = 1, first_attempt_at = now(), last_attempt_at = now(), locked_until = NULL
     WHERE phone_key = k;
    n := 1;
  ELSE
    n := v.attempts + 1;
    UPDATE public.login_attempts
       SET attempts = n,
           last_attempt_at = now(),
           locked_until = CASE WHEN n >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE phone_key = k;
    IF n >= 5 THEN lock_secs := 900; END IF;
  END IF;

  INSERT INTO public.logs(action, entity, metadata)
  VALUES (
    CASE WHEN lock_secs > 0 THEN 'LOGIN_LOCKED' ELSE 'LOGIN_FAILED' END,
    'auth',
    jsonb_build_object('phone_tail', right(k, 3), 'attempts', n)
  );

  RETURN lock_secs;
END;
$$;

REVOKE ALL ON FUNCTION public.login_guard_check(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_guard_record(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_guard_check(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.login_guard_record(text, boolean) TO anon, authenticated, service_role;