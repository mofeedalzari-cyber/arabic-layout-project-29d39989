
-- Attach trigger to prevent non-admin users from self-elevating is_active/network_id
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Add an explicit tighter WITH CHECK on the profiles update policy so agents cannot flip is_active/network_id on their own row
DROP POLICY IF EXISTS "profiles update" ON public.profiles;
CREATE POLICY "profiles update"
  ON public.profiles
  FOR UPDATE
  USING ((id = auth.uid()) OR (network_id = public.admin_network(auth.uid())))
  WITH CHECK (
    -- Admin of the network can update any row in their network
    network_id = public.admin_network(auth.uid())
    OR (
      -- Self-update allowed only if the sensitive fields are unchanged
      id = auth.uid()
      AND is_active = (SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid())
      AND network_id IS NOT DISTINCT FROM (SELECT p.network_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- Explicitly deny direct writes to user_roles from client roles; all role assignment must go through SECURITY DEFINER RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
