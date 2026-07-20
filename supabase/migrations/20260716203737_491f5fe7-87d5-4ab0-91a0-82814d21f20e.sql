CREATE OR REPLACE FUNCTION public.list_active_networks()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name FROM public.networks WHERE is_active = true ORDER BY name;
$$;
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon, authenticated;