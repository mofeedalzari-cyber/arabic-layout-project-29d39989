CREATE OR REPLACE FUNCTION public.superadmin_delete_reset_requests(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.password_reset_requests WHERE id = ANY(_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_delete_reset_requests(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_reset_requests(uuid[]) TO authenticated;