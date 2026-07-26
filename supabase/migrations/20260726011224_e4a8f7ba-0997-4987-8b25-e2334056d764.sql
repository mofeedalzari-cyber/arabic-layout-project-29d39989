
-- Let superadmin SELECT everything on networks, packages, cards
CREATE POLICY "networks superadmin read" ON public.networks
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));

CREATE POLICY "packages superadmin read" ON public.packages
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));

CREATE POLICY "cards superadmin read" ON public.cards
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
