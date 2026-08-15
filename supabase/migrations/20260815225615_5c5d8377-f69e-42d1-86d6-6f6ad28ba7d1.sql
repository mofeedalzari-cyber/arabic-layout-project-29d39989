CREATE OR REPLACE FUNCTION public.sold_card_credentials(_card_ids uuid[])
RETURNS TABLE(id uuid, username text, password text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.username, c.password
  FROM public.cards c
  WHERE c.id = ANY(COALESCE(_card_ids, '{}'::uuid[]))
    AND c.status = 'SOLD'
    AND (
      c.sold_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.networks n
        WHERE n.id = c.network_id AND n.owner_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
$$;

REVOKE ALL ON FUNCTION public.sold_card_credentials(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sold_card_credentials(uuid[]) TO authenticated;