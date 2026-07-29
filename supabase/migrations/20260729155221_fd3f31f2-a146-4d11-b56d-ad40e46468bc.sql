
-- Password reset requests + superadmin reset function

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'PENDING',
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_reads_reset_requests" ON public.password_reset_requests;
CREATE POLICY "superadmin_reads_reset_requests"
ON public.password_reset_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "superadmin_manages_reset_requests" ON public.password_reset_requests;
CREATE POLICY "superadmin_manages_reset_requests"
ON public.password_reset_requests FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- Anyone (including anon) can submit a request. Doesn't reveal whether the phone exists.
CREATE OR REPLACE FUNCTION public.submit_password_reset_request(_phone text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clean text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
BEGIN
  IF length(v_clean) < 6 THEN
    RAISE EXCEPTION 'رقم الجوال غير صحيح';
  END IF;
  INSERT INTO public.password_reset_requests(phone, note)
  VALUES (v_clean, nullif(trim(coalesce(_note,'')), ''));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_password_reset_request(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_password_reset_request(text, text) TO anon, authenticated;

-- Superadmin: list requests with matched profile info
CREATE OR REPLACE FUNCTION public.superadmin_reset_requests()
RETURNS TABLE(
  id uuid, phone text, note text, status text,
  created_at timestamptz, resolved_at timestamptz,
  matched_user_id uuid, matched_full_name text, matched_username text, matched_network_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.phone, r.note, r.status, r.created_at, r.resolved_at,
    p.id, p.full_name, p.username, n.name
  FROM public.password_reset_requests r
  LEFT JOIN public.profiles p
    ON regexp_replace(coalesce(p.phone,''),'\D','','g') = r.phone
    OR p.username = ('u' || r.phone)
  LEFT JOIN public.networks n ON n.id = p.network_id
  WHERE public.has_role(auth.uid(),'superadmin')
  ORDER BY r.created_at DESC
  LIMIT 500;
$$;
REVOKE EXECUTE ON FUNCTION public.superadmin_reset_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_reset_requests() TO authenticated;

-- Superadmin: reset a user's password directly (updates auth.users.encrypted_password)
CREATE OR REPLACE FUNCTION public.superadmin_reset_password(_target_user_id uuid, _new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'target user required'; END IF;
  IF _new_password IS NULL OR length(_new_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = _target_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.superadmin_reset_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_reset_password(uuid, text) TO authenticated;

-- Superadmin: resolve a reset request
CREATE OR REPLACE FUNCTION public.superadmin_resolve_reset_request(_id uuid, _status text DEFAULT 'RESOLVED')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.password_reset_requests
     SET status = COALESCE(nullif(_status,''),'RESOLVED'),
         resolved_at = now(),
         resolved_by = auth.uid()
   WHERE id = _id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.superadmin_resolve_reset_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_resolve_reset_request(uuid, text) TO authenticated;
