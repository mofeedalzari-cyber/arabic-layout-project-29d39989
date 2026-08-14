CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own device tokens" ON public.device_tokens;
CREATE POLICY "own device tokens" ON public.device_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON public.device_tokens(user_id);

CREATE OR REPLACE FUNCTION public.register_device_token(_token text, _platform text DEFAULT 'android')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR _token IS NULL OR length(_token) < 10 THEN
    RETURN;
  END IF;
  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (auth.uid(), _token, coalesce(_platform, 'android'))
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = coalesce(_platform, 'android'), updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;

-- Tokens of the admins/owners of a given network (used to notify managers of new card requests)
CREATE OR REPLACE FUNCTION public.network_admin_push_tokens(_network_id uuid)
RETURNS TABLE(token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dt.token
  FROM public.device_tokens dt
  JOIN public.user_roles ur ON ur.user_id = dt.user_id AND ur.role = 'admin'
  JOIN public.profiles p ON p.id = dt.user_id
  WHERE p.network_id = _network_id
    AND p.is_active
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.network_id = _network_id
    );
$$;

REVOKE ALL ON FUNCTION public.network_admin_push_tokens(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_admin_push_tokens(uuid) TO authenticated;

-- Tokens of a specific agent, readable only by an admin of the same network
CREATE OR REPLACE FUNCTION public.agent_push_tokens(_agent_id uuid)
RETURNS TABLE(token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dt.token
  FROM public.device_tokens dt
  JOIN public.profiles p ON p.id = dt.user_id
  WHERE dt.user_id = _agent_id
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.user_roles ur ON ur.user_id = me.id AND ur.role IN ('admin','superadmin')
      WHERE me.id = auth.uid() AND (ur.role = 'superadmin' OR me.network_id = p.network_id)
    );
$$;

REVOKE ALL ON FUNCTION public.agent_push_tokens(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_push_tokens(uuid) TO authenticated;