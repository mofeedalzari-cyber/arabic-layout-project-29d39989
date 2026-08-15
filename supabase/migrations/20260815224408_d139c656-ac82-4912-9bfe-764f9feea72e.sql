-- Remove table-wide SELECT (which included the sensitive password column)
REVOKE SELECT ON public.cards FROM authenticated;
REVOKE SELECT ON public.cards FROM anon;

-- Re-grant column-level SELECT excluding "password"
GRANT SELECT (
  id, package_id, network_id, username, status,
  sold_to, sold_at, assigned_to, assigned_at, created_at
) ON public.cards TO authenticated;

GRANT ALL ON public.cards TO service_role;