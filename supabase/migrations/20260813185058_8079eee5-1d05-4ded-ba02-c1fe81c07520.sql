-- Hide card credentials (username/password) from direct table reads.
REVOKE SELECT (username, password) ON public.cards FROM authenticated;
REVOKE SELECT (username, password) ON public.cards FROM anon;

-- Agents read their own cards for a package; credentials only exposed after sale.
CREATE OR REPLACE FUNCTION public.agent_list_package_cards(_package_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  status card_status,
  assigned_at timestamptz,
  sold_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         CASE WHEN c.status = 'SOLD' AND c.sold_to = auth.uid() THEN c.username ELSE NULL END,
         c.status,
         c.assigned_at,
         c.sold_at
  FROM public.cards c
  WHERE c.package_id = _package_id
    AND (c.assigned_to = auth.uid() OR c.sold_to = auth.uid())
$$;

REVOKE ALL ON FUNCTION public.agent_list_package_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_list_package_cards(uuid) TO authenticated;