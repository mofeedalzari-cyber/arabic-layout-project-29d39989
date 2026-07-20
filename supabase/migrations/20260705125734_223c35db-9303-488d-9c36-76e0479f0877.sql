GRANT SELECT, INSERT, UPDATE, DELETE ON public.networks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

GRANT ALL ON public.networks TO service_role;
GRANT ALL ON public.packages TO service_role;
GRANT ALL ON public.cards TO service_role;
GRANT ALL ON public.card_requests TO service_role;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.logs TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;