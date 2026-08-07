GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.username_from_phone(text) FROM PUBLIC;