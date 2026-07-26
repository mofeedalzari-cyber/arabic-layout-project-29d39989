
DROP POLICY IF EXISTS "profiles update" ON public.profiles;

CREATE POLICY "profiles update" ON public.profiles
FOR UPDATE
USING (
  id = auth.uid()
  OR network_id = public.admin_network(auth.uid())
)
WITH CHECK (
  id = auth.uid()
  OR network_id = public.admin_network(auth.uid())
);
